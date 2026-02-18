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
      <div className="glass panel">
        <h3>Connect GitHub</h3>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          Log in to GitHub to view latest commits. The app still works without it.
        </p>
        <a className="button-primary" href="/auth/github/start" style={{ display: "inline-block", marginTop: 12 }}>
          Log in with GitHub
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="glass panel">
        <div className="filter-row">
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
        {error && <p style={{ color: "salmon", marginTop: 8 }}>{error}</p>}
        {loading && <p style={{ color: "var(--muted)", marginTop: 8 }}>Loading commits...</p>}
        {rateLimit && (
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            Rate limit remaining: {rateLimit.remaining} · resets at{" "}
            {new Date(rateLimit.reset * 1000).toLocaleTimeString()}
          </p>
        )}
      </div>

      {state.userSettings.selectedRepos.map((repo) => {
        const key = `${repo.repo}#${repo.branch}`;
        return (
          <div key={key} className="glass panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3>{repo.repo}</h3>
                <p style={{ color: "var(--muted)" }}>Branch: {repo.branch}</p>
              </div>
              <button className="button-secondary" onClick={() => removeRepo(repo)}>
                Remove
              </button>
            </div>
            <div className="table" style={{ marginTop: 12 }}>
              {(commits[key] || []).map((commit) => (
                <div key={commit.sha} className="table-row">
                  <div>
                    <strong>{commit.message}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {commit.author} · {formatDate(commit.date)} · {commit.shortSha}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.7rem" }}>{commit.url}</div>
                  </div>
                  <span className="chip">{commit.shortSha}</span>
                </div>
              ))}
              {!commits[key] && <p style={{ color: "var(--muted)" }}>No commits loaded.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
