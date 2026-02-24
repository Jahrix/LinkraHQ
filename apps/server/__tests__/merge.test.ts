import { describe, expect, it } from "vitest";
import { AppStateSchema } from "@linkra/shared";
import { mergeStates } from "../src/store";

function makeState() {
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
        name: "Project",
        subtitle: "",
        icon: "🧩",
        color: "#fff",
        status: "In Progress",
        progress: 0,
        weeklyHours: 3,
        githubRepo: null,
        remoteRepo: null,
        localRepoPath: null,
        healthScore: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: []
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

describe("merge import strategies", () => {
  it("prefers incoming values when overwrite mode is used", () => {
    const current = makeState();
    const incoming = makeState();
    incoming.projects[0].name = "Incoming";
    const merged = mergeStates(current, incoming, true);
    expect(merged.projects[0].name).toBe("Incoming");
  });

  it("keeps local values when keep-local mode is used", () => {
    const current = makeState();
    const incoming = makeState();
    incoming.projects[0].name = "Incoming";
    const merged = mergeStates(current, incoming, false);
    expect(merged.projects[0].name).toBe("Project");
  });
});
