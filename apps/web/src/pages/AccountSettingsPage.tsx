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

    const [activeTab, setActiveTab] = useState<TabId | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<{ full_name: string | null; role: string | null } | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

    // Controlled form field state — mirrors profile row and resets on cancel.
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [role, setRole] = useState("");
    const [githubPat, setGithubPat] = useState("");

    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(async ({ data }) => {
            const u = data.user;
            setUser(u);
            if (u) {
                const { data: profileData } = await supabase
                    .from("profiles")
                    .select("full_name, role")
                    .eq("id", u.id)
                    .single();
                setProfile(profileData);
                const names = (profileData?.full_name || "").split(" ");
                setFirstName(names[0] || "");
                setLastName(names.slice(1).join(" ") || "");
                setRole(profileData?.role || "");
            }
        });
        if (state?.userSettings.githubPat) {
            setGithubPat(state.userSettings.githubPat);
        }
    }, [state?.userSettings.githubPat]);

    useEffect(() => {
        const onResize = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // When user cancels editing, reset form fields to current profile values.
    const handleCancelEdit = () => {
        const names = (profile?.full_name || "").split(" ");
        setFirstName(names[0] || "");
        setLastName(names.slice(1).join(" ") || "");
        setRole(profile?.role || "");
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
        if (!user) return;
        const name = `${firstName} ${lastName}`.trim();

        const { error } = await supabase
            .from("profiles")
            .update({ full_name: name, role, updated_at: new Date().toISOString() })
            .eq("id", user.id);

        if (error) {
            push("Failed to update profile.");
        } else {
            setProfile({ full_name: name, role });
            push("Profile updated successfully!");
            setIsEditing(false);
            // Best-effort secondary sync so user_metadata stays roughly in sync.
            supabase.auth.updateUser({ data: { full_name: name, role } });
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

    const displayName = profile?.full_name || "User";
    const initial = firstName[0] || displayName[0] || "U";

    const toggleTab = (tab: TabId) => {
        setActiveTab(activeTab === tab ? null : tab);
    };

    // ─── Desktop layout ────────────────────────────────────────────────────────

    if (isDesktop) {
        // On desktop, treat null as "Profile" (default section)
        const desktopTab = activeTab ?? "Profile";

        const desktopNavItems: { id: TabId; label: string }[] = [
            { id: "Profile", label: "My Profile" },
            { id: "LockIn", label: "Lock-in Dashboard Elements" },
            { id: "Integrations", label: "Integrations" },
            { id: "Data", label: "Data Export" },
        ];

        const profileEditForm = (
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First Name</label>
                        <input
                            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', color: '#111827', fontSize: '14px', outline: 'none' }}
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Your first name"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Name</label>
                        <input
                            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', color: '#111827', fontSize: '14px', outline: 'none' }}
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Your last name"
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role / Bio</label>
                    <input
                        style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', color: '#111827', fontSize: '14px', outline: 'none' }}
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder="LinkraHQ User"
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="submit" style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                        Save changes
                    </button>
                    <button type="button" onClick={handleCancelEdit} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: 'transparent', color: '#374151', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                        Cancel
                    </button>
                </div>
            </form>
        );

        const profileReadView = (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>First Name</div>
                    <div style={{ fontSize: '15px', color: '#111827' }}>{firstName || '—'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Last Name</div>
                    <div style={{ fontSize: '15px', color: '#111827' }}>{lastName || '—'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Email Address</div>
                    <div style={{ fontSize: '15px', color: '#111827' }}>{user?.email || '—'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Role / Bio</div>
                    <div style={{ fontSize: '15px', color: '#111827' }}>{profile?.role || 'LinkraHQ User'}</div>
                </div>
            </div>
        );

        const sectionContent: Record<TabId, React.ReactNode> = {
            Profile: (
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 24px 0' }}>My Profile</h2>
                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px 0' }} />

                    {/* Profile card row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#7c5cfc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                                {initial.toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontSize: '17px', fontWeight: '700', color: '#111827' }}>{displayName}</div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px' }}>{profile?.role || 'LinkraHQ User'}</div>
                            </div>
                        </div>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: '500', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                Edit ✏️
                            </button>
                        )}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px 0' }} />

                    {/* Personal information */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: 0 }}>Personal information</h3>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '13px', fontWeight: '500', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                Edit ✏️
                            </button>
                        )}
                    </div>

                    {isEditing ? profileEditForm : profileReadView}
                </div>
            ),

            LockIn: (
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>Lock-in Dashboard Elements</h2>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px 0' }}>Customize the items appearing automatically on the Lock-In view.</p>
                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px 0' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', cursor: 'pointer' }}>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: '500', color: '#111827' }}>Daily Goals Tracking</div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Show active rings and completion steps for today</div>
                            </div>
                            <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_daily_goals'))} onChange={() => toggleFeature('ui_daily_goals')} style={{ width: '18px', height: '18px', accentColor: '#7c5cfc' }} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', cursor: 'pointer' }}>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: '500', color: '#111827' }}>Capacity / Burn Down</div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Monitor available hours scheduled across projects</div>
                            </div>
                            <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_capacity'))} onChange={() => toggleFeature('ui_capacity')} style={{ width: '18px', height: '18px', accentColor: '#7c5cfc' }} />
                        </label>
                    </div>
                </div>
            ),

            Integrations: (
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>Integrations</h2>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px 0' }}>Connect third-party accounts to sync data seamlessly.</p>
                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px 0' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', backgroundColor: '#111827', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <i className="fa-brands fa-github"></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>GitHub</div>
                                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Sync repos or commit streams</div>
                                </div>
                            </div>
                            {hasGithubIdentity(user) ? (
                                <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: '500', padding: '4px 12px', borderRadius: '999px', backgroundColor: '#dcfce7' }}>Connected</span>
                            ) : (
                                <button onClick={linkGithub} disabled={isLinking} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
                                    {isLinking ? "Redirecting..." : "Connect"}
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', color: '#000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '1px solid #e5e7eb' }}>
                                    <i className="fa-brands fa-google"></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>Google</div>
                                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Sync identity and metadata</div>
                                </div>
                            </div>
                            {hasGoogleIdentity(user) ? (
                                <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: '500', padding: '4px 12px', borderRadius: '999px', backgroundColor: '#dcfce7' }}>Connected</span>
                            ) : (
                                <button onClick={linkGoogle} disabled={isLinking} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
                                    {isLinking ? "Redirecting..." : "Connect"}
                                </button>
                            )}
                        </div>

                        <div style={{ padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', color: '#374151', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', border: '1px solid #e5e7eb' }}>
                                        🔑
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>GitHub PAT</div>
                                        <div style={{ fontSize: '13px', color: '#6b7280' }}>Private repo tracking</div>
                                    </div>
                                </div>
                                <button onClick={saveGithubPat} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                    Save PAT
                                </button>
                            </div>
                            <input
                                type="password"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#111827', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                value={githubPat}
                                onChange={(e) => setGithubPat(e.target.value)}
                            />
                            <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: '1.5' }}>
                                Generate a token with <code style={{ color: '#7c5cfc' }}>repo</code> and <code style={{ color: '#7c5cfc' }}>read:user</code> scopes. Your token is stored in your private application state blob.
                            </div>
                        </div>
                    </div>
                </div>
            ),

            Data: (
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>Data Export</h2>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px 0' }}>Safely export your entire lock-in dataset as JSON or import an existing snapshot.</p>
                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px 0' }} />

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
                        <button onClick={handleExport} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                            Export JSON
                        </button>
                        <label style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>
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
                    {importError && <div style={{ marginBottom: '16px', fontSize: '13px', color: '#ef4444' }}>{importError}</div>}

                    {preview && (
                        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>Import Preview</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>{preview.counts.projects}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>Projects</div></div>
                                <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>{preview.counts.tasks}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>Tasks</div></div>
                                <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>{preview.counts.goals}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>Goals</div></div>
                                <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>{preview.counts.localRepos}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>Repos</div></div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => applyImport("replace")} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Replace All</button>
                                <button onClick={() => applyImport("merge_keep")} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #e5e7eb', backgroundColor: 'transparent', color: '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Merge</button>
                            </div>
                        </div>
                    )}

                    <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 20px 0' }} />
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>Danger Zone</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>Irreversibly delete all data tracked in the current Linkra instance.</div>
                    <button onClick={handleWipe} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)', color: '#ef4444', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                        Wipe Local Data
                    </button>
                </div>
            ),
        };

        return (
            <div style={{
                display: 'flex',
                minHeight: '100%',
                backgroundColor: '#ffffff',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                {/* Left Sidebar */}
                <div style={{
                    width: '220px',
                    flexShrink: 0,
                    backgroundColor: '#ffffff',
                    borderRight: '1px solid #e5e7eb',
                    padding: '32px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 12px' }}>
                        {desktopNavItems.map(({ id, label }) => {
                            const isActive = desktopTab === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: isActive ? '600' : '400',
                                        color: isActive ? '#7c5cfc' : '#374151',
                                        backgroundColor: isActive ? 'rgba(124,92,252,0.08)' : 'transparent',
                                        transition: 'background-color 0.15s, color 0.15s',
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}

                        <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '8px 0' }} />

                        <button
                            onClick={() => setActiveTab("Data")}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '400',
                                color: '#ef4444',
                                backgroundColor: 'transparent',
                                transition: 'background-color 0.15s',
                            }}
                        >
                            Delete Account
                        </button>
                    </nav>

                    <div style={{ padding: '0 12px' }}>
                        <button
                            onClick={logout}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(239,68,68,0.25)',
                                backgroundColor: 'transparent',
                                color: '#ef4444',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                        >
                            Sign Out
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
                    <div style={{ maxWidth: '600px' }}>
                        {sectionContent[desktopTab]}
                    </div>
                </div>
            </div>
        );
    }

    // ─── Mobile layout (unchanged) ─────────────────────────────────────────────

    return (
        <div style={{
            backgroundColor: '#0d0d0f',
            minHeight: '100%',
            padding: '20px',
            color: '#ffffff',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxSizing: 'border-box'
        }}>
            <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>

                {/* TOP SECTION */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '16px' }}>
                    <div style={{
                        width: '88px',
                        height: '88px',
                        borderRadius: '50%',
                        backgroundColor: '#7c5cfc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '36px',
                        fontWeight: '700',
                        color: '#ffffff',
                        marginBottom: '16px'
                    }}>
                        {initial.toUpperCase()}
                    </div>

                    <h2 style={{
                        fontSize: '22px',
                        fontWeight: '700',
                        margin: '0 0 12px 0',
                        color: '#ffffff'
                    }}>
                        {displayName}
                    </h2>

                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '9999px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            backgroundColor: 'transparent',
                            color: '#ffffff',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            marginBottom: '24px',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        {isEditing ? "Cancel Editing" : "Edit Profile"}
                    </button>

                    {/* Personal Info Card */}
                    {isEditing ? (
                        <form onSubmit={handleUpdateProfile} style={{
                            width: '100%',
                            backgroundColor: '#1a1a1f',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>First Name</label>
                                <input
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '16px', outline: 'none' }}
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="Your first name"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>Last Name</label>
                                <input
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '16px', outline: 'none' }}
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Your last name"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>Role / Sub-title</label>
                                <input
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '16px', outline: 'none' }}
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    placeholder="LinkraHQ User"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="submit" style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontWeight: '600', fontSize: '15px', cursor: 'pointer' }}>
                                    Save
                                </button>
                                <button type="button" onClick={handleCancelEdit} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#fff', fontWeight: '600', fontSize: '15px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div style={{
                            width: '100%',
                            backgroundColor: '#1a1a1f',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '0 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Name</div>
                                    <div style={{ fontSize: '16px', fontWeight: '400' }}>{displayName}</div>
                                </div>
                                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '8px' }} onClick={() => setIsEditing(true)}>✏️</button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Email</div>
                                    <div style={{ fontSize: '16px', fontWeight: '400' }}>{user?.email || "No email"}</div>
                                </div>
                                <div style={{ padding: '8px', color: 'transparent' }}>✏️</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Username / Role</div>
                                    <div style={{ fontSize: '16px', fontWeight: '400' }}>{profile?.role || "LinkraHQ User"}</div>
                                </div>
                                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '8px' }} onClick={() => setIsEditing(true)}>✏️</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* MIDDLE SECTION - Settings List */}
                <div style={{
                    backgroundColor: '#1a1a1f',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div
                        onClick={() => toggleTab("Profile")}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: activeTab === 'Profile' ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '20px' }}>👤</span>
                            <span style={{ fontSize: '16px', fontWeight: '500' }}>Profile</span>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', transform: activeTab === 'Profile' ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                    </div>
                    {activeTab === 'Profile' && (
                        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(0,0,0,0.2)', fontSize: '14px', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            Your profile information is displayed and editable in the section above.
                        </div>
                    )}

                    <div
                        onClick={() => toggleTab("LockIn")}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: activeTab === 'LockIn' ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '20px' }}>🔒</span>
                            <span style={{ fontSize: '16px', fontWeight: '500' }}>Lock-in Dashboard Elements</span>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', transform: activeTab === 'LockIn' ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                    </div>
                    {activeTab === 'LockIn' && (
                        <div style={{ padding: '20px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px', marginTop: '0' }}>Customize the items appearing automatically on the Lock-In view.</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ fontSize: '15px', fontWeight: '500', color: '#fff' }}>Daily Goals Tracking</div>
                                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>Show active rings and completion steps for today</div>
                                    </div>
                                    <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_daily_goals'))} onChange={() => toggleFeature('ui_daily_goals')} style={{ width: '18px', height: '18px', accentColor: '#7c5cfc' }} />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ fontSize: '15px', fontWeight: '500', color: '#fff' }}>Capacity / Burn Down</div>
                                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>Monitor available hours scheduled across projects</div>
                                    </div>
                                    <input type="checkbox" checked={!(state?.userSettings.disabledInsightRules?.includes('ui_capacity'))} onChange={() => toggleFeature('ui_capacity')} style={{ width: '18px', height: '18px', accentColor: '#7c5cfc' }} />
                                </label>
                            </div>
                        </div>
                    )}

                    <div
                        onClick={() => toggleTab("Integrations")}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: activeTab === 'Integrations' ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '20px' }}>🔗</span>
                            <span style={{ fontSize: '16px', fontWeight: '500' }}>Integrations</span>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', transform: activeTab === 'Integrations' ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                    </div>
                    {activeTab === 'Integrations' && (
                        <div style={{ padding: '20px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: '0 0 16px 0' }}>Connect third-party accounts to sync data seamlessly.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', color: '#000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                            <i className="fa-brands fa-github"></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: '600' }}>GitHub</div>
                                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Sync repos or commit streams</div>
                                        </div>
                                    </div>
                                    {hasGithubIdentity(user) ? (
                                        <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: '500', padding: '4px 12px', borderRadius: '999px', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>Connected</span>
                                    ) : (
                                        <button onClick={linkGithub} disabled={isLinking} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                                            {isLinking ? "Redirecting..." : "Connect"}
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', color: '#000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                            <i className="fa-brands fa-google"></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: '600' }}>Google</div>
                                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Sync identity and metadata</div>
                                        </div>
                                    </div>
                                    {hasGoogleIdentity(user) ? (
                                        <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: '500', padding: '4px 12px', borderRadius: '999px', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>Connected</span>
                                    ) : (
                                        <button onClick={linkGoogle} disabled={isLinking} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                                            {isLinking ? "Redirecting..." : "Connect"}
                                        </button>
                                    )}
                                </div>

                                <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                                🔑
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '15px', fontWeight: '600' }}>GitHub PAT</div>
                                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Private repo tracking</div>
                                            </div>
                                        </div>
                                        <button onClick={saveGithubPat} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                            Save PAT
                                        </button>
                                    </div>
                                    <input
                                        type="password"
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                        value={githubPat}
                                        onChange={(e) => setGithubPat(e.target.value)}
                                    />
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5' }}>
                                        Generate a token with <code style={{ color: '#7c5cfc' }}>repo</code> and <code style={{ color: '#7c5cfc' }}>read:user</code> scopes. Your token is stored in your private application state blob.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div
                        onClick={() => toggleTab("Data")}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', backgroundColor: activeTab === 'Data' ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '20px' }}>📤</span>
                            <span style={{ fontSize: '16px', fontWeight: '500' }}>Data Export</span>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', transform: activeTab === 'Data' ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                    </div>
                    {activeTab === 'Data' && (
                        <div style={{ padding: '20px', backgroundColor: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Export & Import</div>
                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>Safely export your entire lock-in dataset as JSON or import an existing snapshot.</div>

                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <button onClick={handleExport} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                        Export JSON
                                    </button>
                                    <label style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>
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
                                {importError && <div style={{ marginTop: '12px', fontSize: '13px', color: '#f87171' }}>{importError}</div>}

                                {preview && (
                                    <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Import Preview</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                            <div><div style={{ fontSize: '18px', fontWeight: '700' }}>{preview.counts.projects}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Projects</div></div>
                                            <div><div style={{ fontSize: '18px', fontWeight: '700' }}>{preview.counts.tasks}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Tasks</div></div>
                                            <div><div style={{ fontSize: '18px', fontWeight: '700' }}>{preview.counts.goals}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Goals</div></div>
                                            <div><div style={{ fontSize: '18px', fontWeight: '700' }}>{preview.counts.localRepos}</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Repos</div></div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => applyImport("replace")} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', backgroundColor: '#7c5cfc', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Replace All</button>
                                            <button onClick={() => applyImport("merge_keep")} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Merge</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>Danger Zone</div>
                                <div style={{ fontSize: '13px', color: 'rgba(239,68,68,0.7)', marginBottom: '12px' }}>Irreversibly delete all data tracked in the current Linkra instance.</div>
                                <button onClick={handleWipe} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                    Wipe Local Data
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTTOM SECTION */}
                <button
                    onClick={logout}
                    style={{
                        width: '100%',
                        padding: '16px',
                        borderRadius: '14px',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444',
                        fontSize: '16px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        marginBottom: '40px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}
