import { describe, expect, it } from "vitest";
import { computeImportDiff } from "../src/lib/importDiff";
import { AppStateSchema } from "@linkra/shared";

describe("import diff", () => {
  it("detects added projects", () => {
    const base = AppStateSchema.parse({
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
      projects: [],
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

    const next = {
      ...base,
      projects: [
        {
          id: "p1",
          name: "Project X",
          subtitle: "",
          icon: "🧩",
          color: "#fff",
          status: "Not Started",
          progress: 0,
          weeklyHours: 0,
          githubRepo: null,
          remoteRepo: null,
          localRepoPath: null,
          healthScore: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tasks: []
        }
      ]
    };

    const diff = computeImportDiff(base, next);
    expect(diff.projects.added).toBe(1);
  });
});
