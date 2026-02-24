import { describe, expect, it } from "vitest";
import { AppStateSchema } from "@linkra/shared";
import { computeInsights } from "../src/insights";

function baseState() {
  return AppStateSchema.parse({
    metadata: { schema_version: 3, created_at: new Date().toISOString() },
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
        watchDir: null,
        remoteUrl: null,
        defaultBranch: "main",
        lastCommitAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        lastCommitMessage: "old commit",
        lastCommitAuthor: "me",
        dirty: true,
        untrackedCount: 1,
        ahead: 0,
        behind: 0,
        todayCommitCount: 0,
        lastHeadSha: "abc",
        lastStatusHash: "def",
        lastScanDurationMs: 0,
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
    insights: [],
    weeklyReviews: [],
    weeklySnapshots: [],
    todayPlanByDate: {},
    github: { loggedIn: false, user: null, lastSyncAt: null, rateLimit: null }
  });
}

describe("insights", () => {
  it("creates stale repo and dirty debt insights", () => {
    const state = baseState();
    const insights = computeInsights(state);
    const ids = insights.map((i) => i.ruleId);
    expect(ids).toContain("STALE_REPO");
    expect(ids).toContain("DIRTY_DEBT");
  });
});
