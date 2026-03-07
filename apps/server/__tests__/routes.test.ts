import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { AppStateSchema, type AppState } from "@linkra/shared";
import { app } from "../src/index";

const servers: Array<ReturnType<typeof app.listen>> = [];

function baseState(): AppState {
  return AppStateSchema.parse({
    metadata: { schema_version: 3, created_at: new Date().toISOString() },
    userSettings: {
      theme: "dark",
      accent: "#5DD8FF",
      reduceMotion: false,
      startOnLogin: false,
      selectedRepos: [],
      goalTemplate: [],
      repoWatchDirs: ["/tmp/repo-a"],
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
        name: "Project A",
        subtitle: "",
        icon: "🧩",
        color: "#fff",
        status: "In Progress",
        progress: 0,
        weeklyHours: 5,
        githubRepo: null,
        remoteRepo: null,
        localRepoPath: "/tmp/repo-a",
        healthScore: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: []
      }
    ],
    localRepos: [
      {
        id: "r1",
        name: "repo-a",
        path: "/tmp/repo-a",
        watchDir: "/tmp",
        remoteUrl: null,
        defaultBranch: "main",
        lastCommitAt: new Date().toISOString(),
        lastCommitMessage: "test commit",
        lastCommitAuthor: "me",
        dirty: false,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        todayCommitCount: 0,
        lastHeadSha: "abc",
        lastStatusHash: "def",
        lastScanDurationMs: 1,
        scanError: null,
        scannedAt: new Date().toISOString()
      }
    ],
    dailyGoalsByDate: {},
    roadmapCards: [],
    sessionLogs: [],
    focusSessions: [],
    quickCaptures: [],
    journalEntries: [],
    insights: [
      {
        id: "i1",
        ts: new Date().toISOString(),
        severity: "warn",
        projectId: "p1",
        repoId: "r1",
        ruleId: "STALE_REPO",
        title: "Repo is stale",
        reason: "No commits in 7 days.",
        metrics: {},
        suggestedActions: [],
        dismissedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    weeklyReviews: [],
    weeklySnapshots: [],
    todayPlanByDate: {},
    github: { loggedIn: false, user: null, lastSyncAt: null, rateLimit: null }
  });
}

async function startServer() {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
});

describe("server stabilization routes", () => {
  it("makes canonical state endpoint unavailable", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/state`);
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload.error).toContain("Supabase");
  });

  it("rejects untrusted origins on local-control routes", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/startup/create`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example.com",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
  });

  it("allows the github oauth callback to reach state validation even with a github referer", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/auth/github/callback?code=test-code&state=test-state`, {
      headers: {
        Referer: "https://github.com/login/oauth/authorize"
      }
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("Invalid OAuth state");
  });

  it("rejects unsafe OPEN_REPO payloads", async () => {
    const baseUrl = await startServer();
    const state = baseState();

    const response = await fetch(`${baseUrl}/api/insights/action`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state,
        action: {
          id: "open-repo",
          type: "OPEN_REPO",
          label: "Open repo",
          payload: {
            repoPath: "https://evil.example.com/repo"
          }
        }
      })
    });

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toContain("local filesystem path");
  });

  it("applies validated insight actions against request state", async () => {
    const baseUrl = await startServer();
    const state = baseState();

    const response = await fetch(`${baseUrl}/api/insights/action`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state,
        action: {
          id: "create-task",
          type: "CREATE_TASK",
          label: "Create task",
          payload: {
            projectId: "p1",
            title: "Review repo health"
          }
        }
      })
    });

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.state.projects[0].tasks).toHaveLength(1);
    expect(payload.state.projects[0].tasks[0].text).toBe("Review repo health");
  });
});
