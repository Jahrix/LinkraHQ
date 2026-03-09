import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../api/ai/build-plan";
import { AppStateSchema } from "../../packages/shared/src/schema";

function buildState() {
  return AppStateSchema.parse({
    metadata: { schema_version: 3, created_at: "2026-03-08T10:00:00.000Z" },
    userSettings: {
      theme: "dark",
      accent: "#5DD8FF",
      reduceMotion: false,
      startOnLogin: false,
      selectedRepos: [],
      goalTemplate: [],
      repoWatchDirs: [],
      repoScanIntervalMinutes: 15,
      repoExcludePatterns: [],
      gitWatcherEnabled: true,
      disabledInsightRules: [],
      enableDailyBackup: true,
      backupRetentionDays: 14,
      schemaVersion: 3
    },
    projects: [
      {
        id: "p1",
        name: "Linkra",
        subtitle: "",
        icon: "🧩",
        color: "#5DD8FF",
        status: "In Progress",
        progress: 0,
        weeklyHours: 6,
        githubRepo: null,
        remoteRepo: null,
        localRepoPath: null,
        healthScore: null,
        archivedAt: null,
        createdAt: "2026-03-08T10:00:00.000Z",
        updatedAt: "2026-03-08T10:00:00.000Z",
        tasks: [
          {
            id: "t1",
            text: "Fix production plan endpoint",
            done: false,
            status: "doing",
            dependsOnIds: [],
            priority: "high",
            dueDate: null,
            milestone: null,
            createdAt: "2026-03-08T10:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        ]
      }
    ],
    localRepos: [],
    dailyGoalsByDate: {},
    roadmapCards: [],
    sessionLogs: [],
    focusSessions: [],
    quickCaptures: [],
    journalEntries: [],
    insights: [],
    weeklyReviews: [],
    weeklySnapshots: [],
    todayPlanByDate: {},
    github: { loggedIn: false, user: null, lastSyncAt: null, rateLimit: null }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Cloudflare build plan function", () => {
  it("rejects non-POST requests with 405 JSON", async () => {
    const response = await onRequest({
      request: new Request("https://notes.jahrix.xyz/api/ai/build-plan"),
      env: {}
    });

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: "Method not allowed. Use POST /api/ai/build-plan."
    });
  });

  it("returns 503 when ANTHROPIC_API_KEY is missing", async () => {
    const response = await onRequest({
      request: new Request("https://notes.jahrix.xyz/api/ai/build-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: buildState() })
      }),
      env: {}
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI planning is not configured. Add ANTHROPIC_API_KEY to Cloudflare Pages for Build My Plan."
    });
  });

  it("returns a valid plan when Anthropic responds with JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ is_admin: false, used: 0, daily_limit: 10, remaining: 10 }]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: "{\"taskIds\":[\"t1\"],\"rationale\":\"Fix the production path first.\"}"
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ is_admin: false, used: 1, daily_limit: 10, remaining: 9 }]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      request: new Request("https://notes.jahrix.xyz/api/ai/build-plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-user-token"
        },
        body: JSON.stringify({ state: buildState() })
      }),
      env: {
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_MODEL: "claude-test",
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_ANON_KEY: "anon-key"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      taskIds: ["t1"],
      rationale: "Fix the production path first.",
      quota: {
        isAdmin: false,
        used: 1,
        dailyLimit: 10,
        remaining: 9
      }
    });
  });

  it("returns 400 when queued task ids are provided but none are eligible", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ is_admin: false, used: 0, daily_limit: 10, remaining: 10 }]),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      request: new Request("https://notes.jahrix.xyz/api/ai/build-plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-user-token"
        },
        body: JSON.stringify({ state: buildState(), queueTaskIds: ["missing-task"] })
      }),
      env: {
        ANTHROPIC_API_KEY: "test-key",
        SUPABASE_URL: "https://supabase.test",
        SUPABASE_ANON_KEY: "anon-key"
      }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No queued tasks available to build a plan from."
    });
  });
});
