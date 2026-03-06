import React, { useEffect, useState } from "react";
import { type RepoConfig } from "@linkra/shared";
import { api, API_BASE } from "../lib/api";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { formatDate } from "../lib/date";
import { useToast } from "../lib/toast";

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
  const [connectError, setConnectError] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  if (!state) return null;

  const loadGithubUser = async () => {
    if (!state.github.loggedIn) return;
    setUserLoading(true);
    try {
      const result = await api.githubUser();
      setGithubUser(result.user);
    } catch {
      setGithubUser(null);
    } finally {
      setUserLoading(false);
    }
  };

  // On mount, detect auth callback params and load user if already connected
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("auth=success")) {
      push("GitHub connected successfully.", "success");
      // Clean up hash
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#commits");
      setConnectError(null);
    } else if (hash.includes("auth=error")) {
      setConnectError("GitHub connection failed. Please try again.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#commits");
    }
    loadGithubUser();
  }, [state.github.loggedIn]);

  const addRepo = async () => {
    if (!repoInput.trim()) return;
    const next = cloneAppState(state);
    next.userSettings.selectedRepos = [
      { repo: repoInput.trim(), branch: branchInput.trim() || "main" },
      ...next.userSettings.selectedRepos
    ];
    setRepoInput("");
    await save(next);
  };

  const removeRepo = async (repo: RepoConfig) => {
    const next = cloneAppState(state);
    next.userSettings.selectedRepos = next.userSettings.selectedRepos.filter(
      (item) => item.repo !== repo.repo || item.branch !== repo.branch
    );
    await save(next);
  };

  const loadCommits = async () => {
    if (!state.github.loggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const results: Record<string, Commit[]> = {};
      for (const repo of state.userSettings.selectedRepos) {
        const response = await api.githubCommits(repo.repo, repo.branch, 12);
        results[`${repo.repo}#${repo.branch}`] = response.commits as Commit[];
        if (response.rateLimit) {
          setRateLimit(response.rateLimit);
        }
      }
      setCommits(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load commits";
      setError(message);
      push(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.logout();
      setGithubUser(null);
      setCommits({});
      push("GitHub disconnected.");
    } catch {
      push("Failed to disconnect GitHub.", "error");
    }
  };

  useEffect(() => {
    loadCommits();
  }, [state.userSettings.selectedRepos, state.github.loggedIn]);

  if (!state.github.loggedIn) {
    return (
      <div className="panel space-y-5 max-w-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub</p>
          <h2 className="text-lg font-semibold">Connect GitHub</h2>
        </div>
        <p className="text-sm text-muted">
          Connect your GitHub account to view commit activity across repositories.
        </p>

        {connectError && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300 flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1">
              <div className="font-medium">{connectError}</div>
              <a
                className="inline-block mt-3 button-primary"
                href={`${API_BASE}/auth/github/start`}
              >
                Try Again
              </a>
            </div>
          </div>
        )}

        {!connectError && (
          <a
            className="button-primary inline-flex w-fit items-center gap-2"
            href={`${API_BASE}/auth/github/start`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
            </svg>
            Connect GitHub
          </a>
        )}
      </div>
    );
  }

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
                <button className="button-secondary text-xs text-red-400 border-red-500/20 hover:bg-red-500/10" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
            )}
            {userLoading && <span className="text-xs text-muted">Loading...</span>}
            <span className="chip">{state.userSettings.selectedRepos.length} repos</span>
          </div>
        </div>

        {connectError && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300">
            {connectError}
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
          <button className="button-secondary" onClick={loadCommits} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button className="button-secondary text-xs" onClick={loadCommits}>
              Retry
            </button>
          </div>
        )}
        {loading && <p className="text-sm text-muted">Loading commits...</p>}
        {rateLimit && (
          <p className="text-xs text-muted">
            Rate limit: {rateLimit.remaining} remaining · resets at{" "}
            {new Date(rateLimit.reset * 1000).toLocaleTimeString()}
          </p>
        )}
      </div>

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
