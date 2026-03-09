import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { SCHEMA_VERSION, applyMigrations, type AppState, type ExportBundle } from "@linkra/shared";
import { api } from "../lib/api";
import {
    applyImportBundle,
    cloneAppState,
    createExportBundle,
    createWipedAppState,
    type ImportMode
} from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { computeImportDiff, type ImportDiffResult } from "../lib/importDiff";
import {
    buildAccountRedirectUrl,
    formatGithubConnectError,
    hasGithubIdentity,
    hasGoogleIdentity,
    startGithubConnect
} from "../lib/githubAuth";
import { supabase } from "../lib/supabase";

type TabId = "Profile" | "Integrations" | "LockIn" | "Data";

const TABS: Array<{ id: TabId; label: string }> = [
    { id: "Profile", label: "My Profile" },
    { id: "LockIn", label: "Lock-in Dashboard Elements" },
    { id: "Integrations", label: "Integrations" },
    { id: "Data", label: "Data Export" },
];

interface ImportPreview {
    bundle: ExportBundle;
    sourceSchemaVersion: number;
    counts: {
        projects: number;
        tasks: number;
        goals: number;
        roadmap: number;
        logs: number;
        focus: number;
        journal: number;
        weeklyReviews: number;
        weeklySnapshots: number;
        localRepos: number;
        dateRange: string;
    };
    diff: ImportDiffResult;
}

export default function AccountSettingsPage() {
    const { state, save, refresh } = useAppState();
    const { push } = useToast();

    const [activeTab, setActiveTab] = useState<TabId>("Profile");
    const [user, setUser] = useState<User | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Controlled form field state — mirrors user metadata and resets on cancel.
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [role, setRole] = useState("");
    const [githubPat, setGithubPat] = useState("");

    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            const u = data.user;
            setUser(u);
            if (u) {
                const names = (u.user_metadata?.full_name || "").split(" ");
                setFirstName(names[0] || "");
                setLastName(names.slice(1).join(" ") || "");
                setRole(u.user_metadata?.role || "");
            }
        });
        if (state?.userSettings.githubPat) {
            setGithubPat(state.userSettings.githubPat);
        }
    }, [state?.userSettings.githubPat]);

    // When user cancels editing, reset form fields to current user metadata.
    const handleCancelEdit = () => {
        if (user) {
            const names = (user.user_metadata?.full_name || "").split(" ");
            setFirstName(names[0] || "");
            setLastName(names.slice(1).join(" ") || "");
            setRole(user.user_metadata?.role || "");
        }
        setIsEditing(false);
    };

    const persistState = async (
        mutate: (draft: AppState) => void,
        failureMessage = "Failed to save changes."
    ) => {
        if (!state) return null;
        const next = cloneAppState(state);
        mutate(next);
        const saved = await save(next);
        if (!saved) {
            push(failureMessage, "error");
            return null;
        }
        return next;
    };

    const linkGithub = async () => {
        setIsLinking(true);
        try {
            const [{ data: { session } }, { data: { user: u } }] = await Promise.all([
                supabase.auth.getSession(),
                supabase.auth.getUser()
            ]);
            const redirectTo = buildAccountRedirectUrl(window.location);
            const result = await startGithubConnect(supabase.auth, redirectTo, {
                hasAppSession: Boolean(session),
                hasLinkedGithubIdentity: hasGithubIdentity(u)
            });

            if (result.error) {
                throw new Error(result.error.message);
            }

            push("Redirecting to GitHub...");
        } catch (error) {
            push(formatGithubConnectError(error), "error");
        } finally {
            setIsLinking(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const name = `${firstName} ${lastName}`.trim();

        const { error } = await supabase.auth.updateUser({ data: { full_name: name, role } });
        if (error) {
            push("Failed to update profile.");
        } else {
            push("Profile updated successfully!");
            setIsEditing(false);
            const { data } = await supabase.auth.getUser();
            if (data?.user) setUser(data.user);
        }
    };

    const linkGoogle = async () => {
        setIsLinking(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: buildAccountRedirectUrl(window.location)
                }
            });
            if (error) throw error;
            push("Redirecting to Google...");
        } catch (error) {
            push(error instanceof Error ? error.message : "Failed to connect Google.", "error");
        } finally {
            setIsLinking(false);
        }
    };

    const logout = async () => {
        await supabase.auth.signOut();
        await api.logout();
        await refresh();
    };

    const saveGithubPat = async () => {
        const saved = await persistState((next) => {
            next.userSettings.githubPat = githubPat.trim() || null;
        }, "Failed to save GitHub PAT.");
        if (saved) {
            push("GitHub PAT saved successfully!", "success");
        }
    };

    const toggleFeature = async (featureId: string) => {
        const saved = await persistState((next) => {
            const disabled = new Set(next.userSettings.disabledInsightRules ?? []);
            if (disabled.has(featureId)) {
                disabled.delete(featureId);
            } else {
                disabled.add(featureId);
            }
            next.userSettings.disabledInsightRules = Array.from(disabled);
        }, "Failed to update dashboard elements.");
        if (!saved) return;
    };

    const handleExport = async () => {
        if (!state) return;
        const bundle = createExportBundle(state);
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `linkra-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportFile = async (file: File) => {
        setImportError(null);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const sourceSchemaVersion = typeof data?.schema_version === "number" ? data.schema_version : 1;
            const parsed = applyMigrations(data);
            const tasks = parsed.data.projects.reduce((sum, project) => sum + project.tasks.length, 0);
            const dates = Object.keys(parsed.data.dailyGoalsByDate).sort();
            const dateRange = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "No dates";
            const counts = {
                projects: parsed.data.projects.length,
                tasks,
                goals: Object.values(parsed.data.dailyGoalsByDate).reduce((sum, entry) => sum + entry.goals.length, 0),
                roadmap: parsed.data.roadmapCards.length,
                logs: parsed.data.sessionLogs.length,
                focus: parsed.data.focusSessions.length,
                journal: parsed.data.journalEntries.length,
                weeklyReviews: parsed.data.weeklyReviews.length,
                weeklySnapshots: parsed.data.weeklySnapshots.length,
                localRepos: parsed.data.localRepos.length,
                dateRange
            };
            if (!state) return;
            const diff = computeImportDiff(state, parsed.data);
            setPreview({ bundle: parsed, counts, diff, sourceSchemaVersion });
        } catch (err) {
            setImportError(err instanceof Error ? err.message : "Invalid JSON schema");
            setPreview(null);
        }
    };

    const applyImport = async (mode: ImportMode) => {
        if (!preview) return;
        if (!state) return;
        const next = applyImportBundle(state, preview.bundle, mode);
        const saved = await save(next);
        if (!saved) {
            push("Import failed.", "error");
            return;
        }
        setPreview(null);
        push(`Import ${mode} complete.`);
    };

    const handleWipe = async () => {
        const confirm = window.confirm("This will wipe all local data. Continue?");
        if (!confirm) return;
        if (!state) return;
        const saved = await save(createWipedAppState(state));
        if (!saved) {
            push("Failed to wipe local data.", "error");
            return;
        }
        push("Local data wiped.");
    };

    const metadata = user?.user_metadata || {};

    return (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 h-full">
            {/* Settings Navigation Sidebar */}
            <div className="flex flex-col gap-2 border-r border-stroke pr-6 min-h-[60vh]">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${activeTab === tab.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-strong"}`}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    onClick={logout}
                    className="text-left px-4 py-2.5 rounded-xl text-sm text-red-500 font-medium hover:bg-red-500/10 mt-auto"
                >
                    Sign Out
                </button>
            </div>

            {/* Main Settings Content */}
            <div className="space-y-6 pb-24 max-w-4xl">
                {activeTab === "Profile" && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold mb-6">My Profile</h2>

                        {/* Header Card */}
                        <div className="panel flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent flex items-center justify-center text-accent text-2xl font-bold">
                                    {firstName[0] || "U"}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-strong">{metadata.full_name || "User"}</h3>
                                    <p className="text-sm text-muted">{metadata.role || "LinkraHQ User"}</p>
                                </div>
                            </div>
                            <button
                                onClick={isEditing ? handleCancelEdit : () => setIsEditing(true)}
                                className="button-secondary"
                            >
                                {isEditing ? "Cancel" : "Edit ✏️"}
                            </button>
                        </div>

                        {/* Personal Information */}
                        <div className="panel space-y-4">
                            <div className="flex justify-between items-center mb-4 border-b border-stroke pb-3 text-strong">
                                <h3 className="font-semibold text-lg">Personal information</h3>
                                <button
                                    onClick={isEditing ? handleCancelEdit : () => setIsEditing(true)}
                                    className="button-secondary text-sm py-1.5 h-8 rounded-full px-4"
                                >
                                    {isEditing ? "Cancel" : "Edit ✏️"}
                                </button>
                            </div>
                            <form onSubmit={handleUpdateProfile} className="grid grid-cols-2 gap-y-6 gap-x-8">
                                <div className="space-y-1.5">
                                    <label className="text-xs text-muted font-medium">First Name</label>
                                    <input
                                        disabled={!isEditing}
                                        name="firstName"
                                        className="input bg-transparent border-0 px-0 outline-none focus:ring-0 text-strong h-auto py-0 font-medium"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="Your name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-muted font-medium">Last Name</label>
                                    <input
                                        disabled={!isEditing}
                                        name="lastName"
                                        className="input bg-transparent border-0 px-0 outline-none focus:ring-0 text-strong h-auto py-0 font-medium"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Your last name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-muted font-medium">Email address</label>
                                    <input
                                        disabled
                                        className="input bg-transparent border-0 px-0 outline-none focus:ring-0 text-strong h-auto py-0 font-medium opacity-80"
                                        value={user?.email || ""}
                                        readOnly
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-muted font-medium">Role / Sub-title</label>
                                    <input
                                        disabled={!isEditing}
                                        name="role"
                                        className="input bg-transparent border-0 px-0 outline-none focus:ring-0 text-strong h-auto py-0 font-medium"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        placeholder="LinkraHQ User"
                                    />
                                </div>
                                {isEditing && <button type="submit" className="col-span-2 button-primary w-fit">Save Profile</button>}
                            </form>
                        </div>

                    </div>
                )}

                {activeTab === "LockIn" && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold mb-6">Lock-in Dashboard Engine Elements</h2>
                        <div className="panel space-y-3">
                            <p className="text-sm text-muted">Customize the items appearing automatically on the Lock-In view for your scoped workflows.</p>
                            <div className="grid gap-2">
                                <label className="flex items-center justify-between rounded-lg border border-stroke bg-subtle px-4 py-3 text-sm">
                                    <div>
                                        <div className="font-medium text-strong">Daily Goals Tracking</div>
                                        <div className="text-xs text-muted mt-1">Show active rings and completion steps for today</div>
                                    </div>
                                    <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_daily_goals'))} onChange={() => toggleFeature('ui_daily_goals')} />
                                </label>
                                <label className="flex items-center justify-between rounded-lg border border-stroke bg-subtle px-4 py-3 text-sm">
                                    <div>
                                        <div className="font-medium text-strong">Capacity / Burn Down</div>
                                        <div className="text-xs text-muted mt-1">Monitor available hours scheduled across projects</div>
                                    </div>
                                    <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_capacity'))} onChange={() => toggleFeature('ui_capacity')} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "Integrations" && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold mb-6">Connected Accounts</h2>

                        <div className="panel space-y-4">
                            <p className="text-sm text-muted">Connect third-party accounts to sync data seamlessly across the Linkra CLI and Lock-In views.</p>

                            <div className="flex items-center justify-between p-4 bg-bg-2 border border-stroke rounded-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center text-2xl">
                                        <i className="fa-brands fa-github" aria-label="GitHub"></i>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-strong">GitHub</p>
                                        <p className="text-xs text-muted">Sign in and sync repos or commit streams</p>
                                    </div>
                                </div>
                                {hasGithubIdentity(user) ? (
                                    <span className="text-sm text-green-500 font-medium px-3 py-1 rounded-full bg-green-500/10">Connected</span>
                                ) : (
                                    <button onClick={linkGithub} disabled={isLinking} className="button-secondary">
                                        {isLinking ? "Redirecting..." : "Connect"}
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-4 bg-bg-2 border border-stroke rounded-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center text-2xl">
                                        <i className="fa-brands fa-google" aria-label="Google"></i>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-strong">Google</p>
                                        <p className="text-xs text-muted">Sync identity and metadata</p>
                                    </div>
                                </div>
                                {hasGoogleIdentity(user) ? (
                                    <span className="text-sm text-green-500 font-medium px-3 py-1 rounded-full bg-green-500/10">Connected</span>
                                ) : (
                                    <button onClick={linkGoogle} disabled={isLinking} className="button-secondary">
                                        {isLinking ? "Redirecting..." : "Connect"}
                                    </button>
                                )}
                            </div>

                            <div className="p-4 bg-bg-2 border border-stroke rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white/5 text-muted rounded-full flex items-center justify-center text-2xl">
                                            <i className="fa-solid fa-key" aria-label="PAT"></i>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-strong">GitHub Personal Access Token</p>
                                            <p className="text-xs text-muted">Use a PAT for long-term & private repo tracking</p>
                                        </div>
                                    </div>
                                    <button onClick={saveGithubPat} className="button-primary text-xs py-1.5">
                                        Save PAT
                                    </button>
                                </div>
                                <input
                                    type="password"
                                    className="input w-full bg-black/20"
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    value={githubPat}
                                    onChange={(e) => setGithubPat(e.target.value)}
                                />
                                <div className="space-y-2">
                                    <p className="text-[10px] text-muted leading-relaxed">
                                        Generate a token in GitHub Settings &rarr; Developer settings &rarr; Personal access tokens &rarr; Tokens (classic).
                                        Required scopes: <code className="text-accent">repo</code> (for private repo access), <code className="text-accent">read:user</code>.
                                    </p>
                                    <div className="flex items-start gap-2 p-2 rounded-lg bg-accent/5 border border-accent/10">
                                        <div className="text-accent mt-0.5"><i className="fa-solid fa-shield-halved text-[10px]"></i></div>
                                        <p className="text-[10px] text-accent/80 leading-relaxed">
                                            <strong>Security Notice:</strong> Your token is stored in your private application state blob.
                                            It is strictly isolated to your account and is never shared or exposed to other users.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="text-xs text-amber-500/80 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                <strong>Note:</strong> By default, Supabase disables linking identities from multiple OAuth providers to a single email for security reasons. If clicking connect throws a <em>"manual linking disabled"</em> error, you need to open your Supabase Dashboard -&gt; Authentication -&gt; Configuration -&gt; Advanced Settings, and toggle <strong>"Allow Manual Linking"</strong> ON.
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "Data" && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold mb-6">Data Management & Export</h2>
                        <div className="panel space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-strong">Export & Import</h2>
                                <p className="text-sm text-muted mt-1">Safely export your entire lock-in dataset as JSON or import an existing snapshot.</p>
                            </div>
                            <div className="filter-row flex-wrap">
                                <button className="button-primary" onClick={handleExport}>
                                    Export JSON
                                </button>
                                <label className="button-secondary inline-flex items-center gap-2 cursor-pointer">
                                    Import JSON
                                    <input
                                        type="file"
                                        accept="application/json"
                                        hidden
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) handleImportFile(file);
                                        }}
                                    />
                                </label>
                            </div>
                            {importError && <p className="text-sm text-red-400">{importError}</p>}

                            {preview && (
                                <div className="panel space-y-3 bg-bg-2">
                                    <div>
                                        <h4 className="text-base font-semibold">Import Preview</h4>
                                        <p className="text-sm text-muted">
                                            Schema {preview.sourceSchemaVersion} → {SCHEMA_VERSION}
                                        </p>
                                    </div>
                                    {preview.sourceSchemaVersion !== SCHEMA_VERSION && (
                                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                                            Older export detected. Linkra will import the migrated v{SCHEMA_VERSION} shape shown below.
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                                        <div><p className="text-xl font-bold">{preview.counts.projects}</p><p className="text-xs text-muted">Projects</p></div>
                                        <div><p className="text-xl font-bold">{preview.counts.tasks}</p><p className="text-xs text-muted">Tasks</p></div>
                                        <div><p className="text-xl font-bold">{preview.counts.goals}</p><p className="text-xs text-muted">Goals</p></div>
                                        <div><p className="text-xl font-bold">{preview.counts.localRepos}</p><p className="text-xs text-muted">Local Repos</p></div>
                                    </div>
                                    <div className="rounded-lg bg-black/20 p-4 font-mono text-xs">
                                        <div>Summary Δ: +{preview.diff.summary.additions} / ~{preview.diff.summary.changes} / -{preview.diff.summary.removals}</div>
                                        <div className="text-amber-300">Items changed by import: {preview.diff.summary.overwrites}</div>
                                    </div>
                                    <div className="filter-row mt-4">
                                        <button className="button-primary" onClick={() => applyImport("replace")}>
                                            Replace All
                                        </button>
                                        <button className="button-secondary" onClick={() => applyImport("merge_keep")}>
                                            Merge (Keep Local)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="panel space-y-4 border border-red-500/20 bg-red-500/5">
                            <h2 className="text-lg font-semibold text-red-500">Delete Account / Wipe Data</h2>
                            <p className="text-sm text-red-400/80">Irreversibly delete all data tracked in the current Linkra instance. Make sure you export first.</p>
                            <button className="button-secondary text-red-500 border-red-500/30 hover:bg-red-500/20" onClick={handleWipe}>
                                Wipe Local Data
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
