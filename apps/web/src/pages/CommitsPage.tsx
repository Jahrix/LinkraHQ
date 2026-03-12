import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type RepoConfig } from "@linkra/shared";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { formatDate } from "../lib/date";
import { useToast } from "../lib/toast";
import { supabase } from "../lib/supabase";
import { playCommitSound } from "../lib/sounds";
import {
  buildCommitsRedirectUrl,
  cacheGithubProviderToken,
  clearCachedGithubProviderToken,
  finalizeAuthRedirectUrl,
  formatGithubConnectError,
  fetchGithubRepoCommits,
  fetchGithubUserProfile,
  getCachedGithubProviderToken,
  getGithubIdentity,
  getGithubIdentityProfile,
  getGithubProviderToken,
  hasGithubIdentity,
  startGithubConnect,
  startGithubReconnect
} from "../lib/githubAuth";

function heatColor(count: number): string {
  if (count === 0) return "rgba(255,255,255,0.05)";
  if (count <= 2) return "#3b1fa8";
  if (count <= 5) return "#5b35d4";
  return "#7c5cfc";
}

interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface GithubUser {
  login: string;
  avatarUrl: string | null;
  name: string | null;
}

const REFRESH_INTERVAL = 60_000;

export default function CommitsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [repoInput, setRepoInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [commits, setCommits] = useState<Record<string, Commit[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; reset: number } | null>(null);
  const [githubUser, setGithubUser] = useState<GithubUser | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Prevents concurrent loadGithubConnection calls from interleaving state updates.
  const isLoadingGithubRef = useRef(false);

  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const dailyCounts = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(commits).flat().forEach((c) => {
      const day = c.date.slice(0, 10);
      map[day] = (map[day] ?? 0) + 1;
    });
    return map;
  }, [commits]);

  const loadCommits = useCallback(async (silent = false) => {
    if (!githubUser || !githubToken || !state) return;
    setLoading(true);
    setError(null);
    const results: Record<string, Commit[]> = {};
    const errors: string[] = [];
    for (const repo of state.userSettings.selectedRepos) {
      try {
        const response = await fetchGithubRepoCommits(githubToken, repo.repo, repo.branch, 12);
        results[`${repo.repo}#${repo.branch}`] = response.commits as Commit[];
        if (response.rateLimit) {
          setRateLimit(response.rateLimit);
        }
      } catch (err) {
        results[`${repo.repo}#${repo.branch}`] = [];
        const message = err instanceof Error ? err.message : "Failed to load commits";
        errors.push(`${repo.repo} (${repo.branch}): ${message}`);
      }
    }
    setCommits(results);

    const isAuthExpired = errors.some(e => e.includes("authorization expired"));
    if (isAuthExpired) {
      setGithubToken(null);
      setError("GitHub authorization expired. Please reconnect.");
    } else {
      setError(errors.length > 0 ? errors.join(" ") : null);
      if (!silent && errors.length === 0 && state.userSettings.selectedRepos.length > 0) {
        playCommitSound();
      }
    }

    setLoading(false);
  }, [githubUser, githubToken, state]);

  const clearLegacyGithubState = useCallback(async () => {
    if (!state || (!state.github.loggedIn && !state.github.user)) return;
    const next = cloneAppState(state);
    next.github.loggedIn = false;
    next.github.user = null;
    const saved = await save(next);
    if (!saved) {
      console.error("Failed to clear legacy GitHub state from Supabase.");
    }
  }, [state, save]);

  const loadGithubConnection = useCallback(async () => {
    // Guard against concurrent calls (e.g. rapid auth events firing back-to-back).
    if (isLoadingGithubRef.current) return;
    isLoadingGithubRef.current = true;
    setUserLoading(true);
    try {
      const [{ data: { session } }, { data: { user } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ]);

      const linked = hasGithubIdentity(user);
      const sessionToken = getGithubProviderToken(session);
      if (sessionToken) {
        cacheGithubProviderToken(sessionToken);
      }
      const token = linked ? sessionToken || getCachedGithubProviderToken() : null;
      const identityProfile = getGithubIdentityProfile(user);

      setGithubConnected(linked);
      setGithubToken(token);

      if (!linked) {
        setGithubUser(null);
        setCommits({});
        setConnectError(null);
        clearCachedGithubProviderToken();
        await clearLegacyGithubState();
        return;
      }

      if (!token) {
        setGithubUser(identityProfile);
        setConnectError(null); // State C is shown via !githubToken branch, no banner needed
        await clearLegacyGithubState();
        return;
      }

      const profile = await fetchGithubUserProfile(token);
      setGithubUser(profile);
      setConnectError(null);
      await clearLegacyGithubState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load GitHub connection";
      setGithubConnected(false);
      setGithubToken(null);
      setGithubUser(null);
      setCommits({});
      setConnectError(message);
      clearCachedGithubProviderToken();
      await clearLegacyGithubState();
    } finally {
      setUserLoading(false);
      setIsCheckingAuth(false);
      isLoadingGithubRef.current = false;
    }
  }, [clearLegacyGithubState]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const cleanedUrl = finalizeAuthRedirectUrl(window.location);
    if (cleanedUrl) {
      window.history.replaceState(null, "", cleanedUrl);
    }

    loadGithubConnection();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        void loadGithubConnection();
      }
      if (event === "SIGNED_OUT") {
        setGithubConnected(false);
        setGithubToken(null);
        setGithubUser(null);
        setCommits({});
        clearCachedGithubProviderToken();
        void clearLegacyGithubState();
      }
    });

    return () => subscription.unsubscribe();
  }, [loadGithubConnection, clearLegacyGithubState]);

  // Load commits + set up 60s auto-refresh when connected
  useEffect(() => {
    if (!githubUser || !githubToken || !state) return;
    loadCommits(true);

    autoRefreshRef.current = setInterval(() => {
      loadCommits(true);
    }, REFRESH_INTERVAL);

    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [loadCommits, githubUser, githubToken, state]);

  if (!state) return null;

  const addRepo = async () => {
    if (!repoInput.trim()) return;
    const next = cloneAppState(state);
    next.userSettings.selectedRepos = [
      { repo: repoInput.trim(), branch: branchInput.trim() || "main" },
      ...next.userSettings.selectedRepos
    ];
    setRepoInput("");
    const saved = await save(next);
    if (!saved) {
      push("Failed to add repository.", "error");
    }
  };

  const removeRepo = async (repo: RepoConfig) => {
    const next = cloneAppState(state);
    next.userSettings.selectedRepos = next.userSettings.selectedRepos.filter(
      (item) => item.repo !== repo.repo || item.branch !== repo.branch
    );
    const saved = await save(next);
    if (!saved) {
      push("Failed to remove repository.", "error");
    }
  };

  const handleConnect = async () => {
    setAuthActionLoading(true);
    setConnectError(null);
    try {
      const [{ data: { session } }, { data: { user } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ]);
      const redirectTo = buildCommitsRedirectUrl(window.location);
      const result = await startGithubConnect(supabase.auth, redirectTo, {
        hasAppSession: Boolean(session),
        hasLinkedGithubIdentity: hasGithubIdentity(user)
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      push("Redirecting to GitHub...");
    } catch (err) {
      const message = formatGithubConnectError(err);
      setConnectError(message);
      push(message, "error");
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleReconnect = async () => {
    setAuthActionLoading(true);
    setConnectError(null);
    try {
      // Refresh session/user state first to avoid stale token issues.
      // This matches the pattern used in handleConnect.
      await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ]);
      const redirectTo = buildCommitsRedirectUrl(window.location);
      const result = await startGithubReconnect(supabase.auth, redirectTo);
      if (result.error) {
        throw new Error(result.error.message);
      }
      push("Redirecting to GitHub...");
    } catch (err) {
      const message = formatGithubConnectError(err);
      setConnectError(message);
      push(message, "error");
    } finally {
      setAuthActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setUnlinkLoading(true);
    setUnlinkError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const identity = getGithubIdentity(user);

      if (!identity) {
        // No GitHub identity found on the Supabase user — treat as already unlinked
        setGithubConnected(false);
        setGithubToken(null);
        setGithubUser(null);
        setCommits({});
        clearCachedGithubProviderToken();
        await clearLegacyGithubState();
        push("GitHub unlinked.");
        return;
      }

      // Check if GitHub is the user's only identity. Supabase blocks unlinkIdentity
      // when it's the sole login method to prevent account lockout.
      const identityCount = user?.identities?.length ?? 0;
      if (identityCount <= 1) {
        throw new Error(
          "GitHub is your only sign-in method. To unlink it, first add an email/password login in Account Settings, then return here to disconnect GitHub."
        );
      }

      const { error: err } = await supabase.auth.unlinkIdentity(identity);
      if (err) throw err;

      setGithubConnected(false);
      setGithubToken(null);
      setGithubUser(null);
      setCommits({});
      setConnectError(null);
      clearCachedGithubProviderToken();
      await clearLegacyGithubState();
      push("GitHub disconnected.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disconnect GitHub.";
      setUnlinkError(message);
    } finally {
      setUnlinkLoading(false);
    }
  };

  if (isCheckingAuth) return null;

  // State A — not connected
  if (!githubConnected) {
    return (
      <div className="panel space-y-5 max-w-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub</p>
          <h2 className="text-lg font-semibold">Connect GitHub</h2>
        </div>
        <p className="text-sm text-muted">
          Connect your GitHub account to track commit activity across public and private repositories.
        </p>

        {connectError && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300 flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1">
              <div className="font-medium">{connectError}</div>
              <button className="inline-block mt-3 button-primary" onClick={handleConnect} disabled={authActionLoading}>
                {authActionLoading ? "Connecting..." : "Try Again"}
              </button>
            </div>
          </div>
        )}

        {!connectError && (
          <button
            className="button-primary inline-flex w-fit items-center gap-2"
            onClick={handleConnect}
            disabled={authActionLoading}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
            </svg>
            {authActionLoading ? "Connecting..." : "Connect GitHub"}
          </button>
        )}
      </div>
    );
  }

  // State C — linked but session token expired/missing
  if (!githubToken) {
    return (
      <div className="panel space-y-5 max-w-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub</p>
          <h2 className="text-lg font-semibold">Reconnect GitHub</h2>
        </div>

        {githubUser && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
              @{githubUser.login}
            </span>
            <span className="text-xs text-muted">Session expired</span>
          </div>
        )}

        <p className="text-sm text-muted">
          Your GitHub session has expired. Reconnect to load commits from your repositories.
        </p>

        {(connectError || unlinkError) && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300 flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{unlinkError ?? connectError}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            className="button-primary inline-flex items-center gap-2"
            onClick={handleReconnect}
            disabled={authActionLoading || unlinkLoading}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
            </svg>
            {authActionLoading ? "Reconnecting..." : "Reconnect GitHub"}
          </button>
          <button
            className="button-secondary text-xs text-red-400 border-red-500/20 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleDisconnect}
            disabled={unlinkLoading || authActionLoading}
          >
            {unlinkLoading ? "Unlinking..." : "Unlink GitHub"}
          </button>
        </div>
      </div>
    );
  }

  const numWeeks = isMobile ? 16 : 52;
  const totalDays = numWeeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build grid cells: start from (numWeeks * 7) days ago, rounded to Sunday
  const gridStart = new Date(today);
  gridStart.setDate(gridStart.getDate() - totalDays + 1);
  // Align to the Sunday before gridStart
  const startOffset = gridStart.getDay();
  gridStart.setDate(gridStart.getDate() - startOffset);

  const gridDays: Date[] = [];
  for (let i = 0; i < numWeeks * 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    gridDays.push(d);
  }

  // Month labels: find which column each month first appears in
  const monthLabels: { label: string; col: number }[] = [];
  gridDays.forEach((d, i) => {
    if (d.getDate() === 1 || i === 0) {
      const col = Math.floor(i / 7);
      const label = d.toLocaleString("default", { month: "short" });
      if (!monthLabels.length || monthLabels[monthLabels.length - 1].label !== label) {
        monthLabels.push({ label, col });
      }
    }
  });

  // State B — fully connected
  return (
    <div className="space-y-6">
      <div className="panel space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Commits</p>
            <h2 className="text-lg font-semibold">Latest activity</h2>
          </div>
          <div className="flex items-center gap-3">
            {githubUser && !userLoading && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  @{githubUser.login}
                </span>
                <button
                  className="button-secondary text-xs text-red-400 border-red-500/20 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleDisconnect}
                  disabled={unlinkLoading}
                >
                  {unlinkLoading ? "Unlinking..." : "Disconnect"}
                </button>
              </div>
            )}
            {userLoading && <span className="text-xs text-muted">Loading...</span>}
            <span className="chip">{state.userSettings.selectedRepos.length} repos</span>
          </div>
        </div>

        {unlinkError && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300 flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{unlinkError}</span>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_auto_auto]">
          <input
            className="input"
            placeholder="owner/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRepo()}
          />
          <input
            className="input"
            placeholder="branch"
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
          />
          <button className="button-primary" onClick={addRepo}>
            Add Repo
          </button>
          <button className="button-secondary" onClick={() => loadCommits()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button className="button-secondary text-xs" onClick={() => loadCommits()}>
              Retry
            </button>
          </div>
        )}

        {rateLimit && (
          <p className="text-xs text-muted">
            Rate limit: {rateLimit.remaining} remaining · resets at{" "}
            {new Date(rateLimit.reset * 1000).toLocaleTimeString()}
          </p>
        )}
      </div>

      {Object.keys(dailyCounts).length > 0 && (
        <div className="panel space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Commit Activity</p>
          <div className="relative overflow-x-auto">
            {/* Month labels */}
            <div className="flex mb-1" style={{ paddingLeft: "0px" }}>
              {monthLabels.map(({ label, col }) => (
                <div
                  key={`${label}-${col}`}
                  className="text-[10px] text-white/30 absolute"
                  style={{ left: `${col * 14}px` }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-4 relative">
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "repeat(7, 12px)",
                  gridAutoFlow: "column",
                  gap: "2px",
                  width: "fit-content"
                }}
              >
                {gridDays.map((d, i) => {
                  const key = d.toISOString().slice(0, 10);
                  const count = dailyCounts[key] ?? 0;
                  return (
                    <div
                      key={i}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        backgroundColor: heatColor(count),
                        cursor: count > 0 ? "pointer" : "default"
                      }}
                      onMouseEnter={(e) => {
                        if (count > 0) {
                          setTooltip({
                            text: `${count} commit${count !== 1 ? "s" : ""} on ${key}`,
                            x: e.clientX,
                            y: e.clientY
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          {tooltip && (
            <div
              className="fixed z-50 bg-[#1a1a1f] border border-white/10 text-xs text-white/80 px-2 py-1 rounded shadow-xl pointer-events-none"
              style={{ left: tooltip.x + 12, top: tooltip.y - 28 }}
            >
              {tooltip.text}
            </div>
          )}
        </div>
      )}

      {state.userSettings.selectedRepos.length === 0 && (
        <div className="panel text-sm text-muted text-center py-8">
          Add a repository above to start tracking commits.
        </div>
      )}

      {state.userSettings.selectedRepos.map((repo) => {
        const key = `${repo.repo}#${repo.branch}`;
        return (
          <div key={key} className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">{repo.repo}</h3>
                <p className="text-sm text-muted">Branch: {repo.branch}</p>
              </div>
              <button className="button-secondary" onClick={() => removeRepo(repo)}>
                Remove
              </button>
            </div>
            <div className="table">
              {(commits[key] || []).map((commit) => (
                <div key={commit.sha} className="table-row">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{commit.message}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {commit.author} · {formatDate(commit.date)}
                    </div>
                  </div>
                  <span className="chip flex-shrink-0">{commit.shortSha || commit.sha.substring(0, 7)}</span>
                </div>
              ))}
              {!commits[key] && !loading && (
                <p className="text-sm text-muted">No commits loaded. Click Refresh.</p>
              )}
              {commits[key]?.length === 0 && (
                <p className="text-sm text-muted">No commits found on this branch.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
