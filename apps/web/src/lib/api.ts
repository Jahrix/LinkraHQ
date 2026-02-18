import type { AppState, ExportBundle } from "@linkra/shared";

const API_BASE = import.meta.env.VITE_API_URL || "";

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
  getState: () => request<{ state: AppState }>("/api/state"),
  saveState: (state: AppState) =>
    request<{ state: AppState }>("/api/state", {
      method: "POST",
      body: JSON.stringify({ state })
    }),
  exportState: () => request<ExportBundle>("/api/export"),
  importState: (mode: "replace" | "merge", data: ExportBundle) =>
    request<{ state: AppState }>("/api/import", {
      method: "POST",
      body: JSON.stringify({ mode, data })
    }),
  wipeState: () => request<{ state: AppState }>("/api/wipe", { method: "POST" }),
  startupStatus: () => request<{ os: string; instructions: string; files: string[] }>("/api/startup/status"),
  createStartup: () => request<{ os: string; instructions: string; files: string[] }>("/api/startup/create", { method: "POST" }),
  githubUser: () => request<{ user: { login: string; avatarUrl: string | null; name: string | null } }>("/api/github/user"),
  githubCommits: (repo: string, branch: string, limit: number) =>
    request<{ commits: any[]; rateLimit: { remaining: number; reset: number } | null }>(
      `/api/github/commits?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&limit=${limit}`
    ),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" })
};
