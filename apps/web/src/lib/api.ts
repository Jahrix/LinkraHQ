import type { AppState, LocalRepo, WeeklyReview, SuggestedAction } from "@linkra/shared";

export interface SuggestedGoal {
  title: string;
  category: string;
  points: number;
  projectId: string | null;
  taskId: string | null;
}

export interface QuotaInfo {
  used: number;
  remaining: number;
  dailyLimit: number;
}

export interface AgentConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  action_taken: string | null;
  created_at: string;
}
import { supabase } from "./supabase";

export const API_BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }

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
    }>("/api/local-git/repos"),
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
      "/api/local-git/scan",
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
  githubUser: (pat?: string | null) =>
    request<{ user: { login: string; avatarUrl: string | null; name: string | null } }>(
      "/api/github/user",
      {
        method: "POST",
        body: JSON.stringify({ pat: pat || undefined })
      }
    ),
  githubCommits: (repo: string, branch: string, limit: number, pat?: string | null) =>
    request<{ commits: any[]; rateLimit: { remaining: number; reset: number } | null }>(
      "/api/github/commits",
      {
        method: "POST",
        body: JSON.stringify({ repo, branch, limit, pat: pat || undefined })
      }
    ),
  githubCommitMatch: (repo: string, text: string, branch = "main", limit = 30, pat?: string | null) =>
    request<{ match: any | null; rateLimit: { remaining: number; reset: number } | null }>(
      "/api/github/commits/match",
      {
        method: "POST",
        body: JSON.stringify({ repo, branch, text, limit, pat })
      }
    ),
  buildMyPlan: (state: AppState, prompt?: string, queueTaskIds?: string[]) =>
    request<{
      taskIds: string[];
      rationale: string;
      quota: { isAdmin: boolean; used: number; dailyLimit: number; remaining: number };
    }>("/api/ai/build-plan", {
      method: "POST",
      body: JSON.stringify({ state, prompt, queueTaskIds })
    }),
  aiPlanQuota: () =>
    request<{ quota: { isAdmin: boolean; used: number; dailyLimit: number; remaining: number } }>(
      "/api/ai/build-plan/quota",
      {
        method: "POST"
      }
    ),
  fillMyDay: (state: AppState) =>
    request<{ goals: SuggestedGoal[]; quota: QuotaInfo }>("/api/fill-my-day", {
      method: "POST",
      body: JSON.stringify({ state })
    }),
  getAgentQuota: () =>
    request<{ allowed: boolean; used: number; limit: number; reset_in_minutes: number }>("/api/agent-quota"),
  getConversations: () =>
    request<{ conversations: AgentConversation[] }>("/api/agent/conversations"),
  getConversationMessages: (id: string) =>
    request<{ messages: AgentMessage[] }>(`/api/agent/conversations/${id}/messages`),
  deleteConversation: (id: string) =>
    request<{ ok: true }>(`/api/agent/conversations/${id}`, { method: "DELETE" }),
  agent: async (messages: { role: string; content: string }[], conversationId?: string | null): Promise<{
    reply: string;
    actionTaken: string | null;
    updatedState: boolean;
    conversationId: string | null;
    quota: { used: number; limit: number; reset_in_minutes: number } | null;
  }> => {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;
    const response = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ messages, conversationId: conversationId ?? null })
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const err = new Error(String(payload.error || `Request failed: ${response.status}`));
      if (response.status === 429) {
        (err as any).resetInMinutes = Number(payload.reset_in_minutes) || 0;
        (err as any).used = Number(payload.used) || 15;
        (err as any).limit = Number(payload.limit) || 15;
      }
      throw err;
    }
    return payload as {
      reply: string;
      actionTaken: string | null;
      updatedState: boolean;
      conversationId: string | null;
      quota: { used: number; limit: number; reset_in_minutes: number } | null;
    };
  },
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" })
};
