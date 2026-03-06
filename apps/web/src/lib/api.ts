import type { AppState, LocalRepo, WeeklyReview, SuggestedAction } from "@linkra/shared";

export const API_BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  gitRepos: () =>
    request<{
      repos: LocalRepo[];
      lastScanAt: string | null;
      lastRunAt: string | null;
      lastDurationMs: number | null;
      reposScanned: number;
      reposChanged: number;
      state: "idle" | "running" | "error";
      errors: string[];
      running: boolean;
      watcherActive: boolean;
    }>("/api/git/repos"),
  gitScan: (state: AppState, repoPath?: string) =>
    request<{
      repos: LocalRepo[];
      state: AppState;
      scanState: "idle" | "running" | "error";
      lastScanAt: string | null;
      lastRunAt: string | null;
      lastDurationMs: number | null;
      reposScanned: number;
      reposChanged: number;
      errors: string[];
      running: boolean;
      watcherActive: boolean;
    }>(
      "/api/git/scan",
      {
        method: "POST",
        body: JSON.stringify({ state, repoPath })
      }
    ),
  gitLocalCommits: (state: AppState, repoPath: string, limit: number, since?: string) =>
    request<{ commits: any[] }>(
      "/api/local-git/commits",
      {
        method: "POST",
        body: JSON.stringify({ state, repoPath, limit, since })
      }
    ),
  localGitHealth: () =>
    request<{
      repos: number;
      dirty: number;
      errors: number;
      lastScanAt: string | null;
      scanState: "idle" | "running" | "error";
      durationMs: number | null;
      reposScanned: number;
      reposChanged: number;
      watcherActive: boolean;
    }>("/api/local-git/health"),
  runInsights: (state: AppState) =>
    request<{ state: AppState }>("/api/insights/run", {
      method: "POST",
      body: JSON.stringify({ state })
    }),
  insightAction: (state: AppState, action: SuggestedAction) =>
    request<{ state: AppState }>("/api/insights/action", {
      method: "POST",
      body: JSON.stringify({ state, action })
    }),
  weeklyGenerate: (state: AppState, weekStart: string) =>
    request<{ review: WeeklyReview }>("/api/weekly/generate", {
      method: "POST",
      body: JSON.stringify({ state, weekStart })
    }),
  weeklyClose: (state: AppState, weekStart: string) =>
    request<{ review: WeeklyReview; state: AppState }>("/api/weekly/close", {
      method: "POST",
      body: JSON.stringify({ state, weekStart })
    }),
  backupRun: (state: AppState, retentionDays?: number) =>
    request<{ filepath: string; dir: string }>("/api/backup/run", {
      method: "POST",
      body: JSON.stringify({ state, retentionDays })
    }),
  startupHealth: () =>
    request<{
      apiReachable: boolean;
      lastScanAt: string | null;
      scanStatus: {
        lastRunAt: string | null;
        durationMs: number | null;
        reposScanned: number;
        reposChanged: number;
        errors: string[];
        watcherActive: boolean;
        running: boolean;
        queued: boolean;
        state: "idle" | "running" | "error";
      };
      gitAvailable: boolean;
      watchDirs: { dir: string; exists: boolean }[];
    }>(
      "/api/startup/health"
    ),
  startupStatus: () => request<{ os: string; instructions: string; files: string[] }>("/api/startup/status"),
  createStartup: () => request<{ os: string; instructions: string; files: string[] }>("/api/startup/create", { method: "POST" }),
  githubUser: () => request<{ user: { login: string; avatarUrl: string | null; name: string | null } }>("/api/github/user"),
  githubCommits: (repo: string, branch: string, limit: number) =>
    request<{ commits: any[]; rateLimit: { remaining: number; reset: number } | null }>(
      `/api/github/commits?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&limit=${limit}`
    ),
  githubCommitMatch: (repo: string, text: string, branch = "main", limit = 30) =>
    request<{ match: any | null; rateLimit: { remaining: number; reset: number } | null }>(
      "/api/github/commits/match",
      {
        method: "POST",
        body: JSON.stringify({ repo, branch, text, limit })
      }
    ),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" })
};
