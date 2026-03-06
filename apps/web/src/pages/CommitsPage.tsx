import React, { useEffect, useState } from "react";
import { type RepoConfig } from "@linkra/shared";
import { api } from "../lib/api";
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

export default function CommitsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [repoInput, setRepoInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [commits, setCommits] = useState<Record<string, Commit[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<{ remaining: number; reset: number } | null>(null);

  if (!state) return null;

  const addRepo = async () => {
    if (!repoInput.trim()) return;
    const next = { ...state };
    next.userSettings.selectedRepos = [
      { repo: repoInput.trim(), branch: branchInput.trim() || "main" },
      ...next.userSettings.selectedRepos
    ];
    setRepoInput("");
    await save(next);
  };

  const removeRepo = async (repo: RepoConfig) => {
    const next = { ...state };
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
      push(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommits();
  }, [state.userSettings.selectedRepos, state.github.loggedIn]);

  if (!state.github.loggedIn) {
    return (
      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub</p>
          <h2 className="text-lg font-semibold">Connect GitHub</h2>
        </div>
        <p className="text-sm text-muted">
          Log in to GitHub to view latest commits. The app still works without it.
        </p>
        <a className="button-primary inline-flex w-fit" href="/auth/github/start">
          Log in with GitHub
        </a>
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
          <span className="chip">{state.userSettings.selectedRepos.length} repos</span>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_auto_auto]">
          <input
            className="input"
            placeholder="owner/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
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
          <button className="button-secondary" onClick={loadCommits}>
            Refresh
          </button>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {loading && <p className="text-sm text-muted">Loading commits...</p>}
        {rateLimit && (
          <p className="text-sm text-muted">
            Rate limit remaining: {rateLimit.remaining} · resets at{" "}
            {new Date(rateLimit.reset * 1000).toLocaleTimeString()}
          </p>
        )}
      </div>

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
                  <div>
                    <strong>{commit.message}</strong>
                    <div className="text-xs text-muted">
                      {commit.author} · {formatDate(commit.date)} · {commit.shortSha}
                    </div>
                    <div className="text-[11px] text-muted">{commit.url}</div>
                  </div>
                  <span className="chip">{commit.shortSha}</span>
                </div>
              ))}
              {!commits[key] && <p className="text-sm text-muted">No commits loaded.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
