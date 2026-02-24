import { describe, expect, it } from "vitest";
import { applyMigrations, SCHEMA_VERSION } from "../src";

describe("migrations", () => {
  it("migrates schema v2 exports to current schema", () => {
    const migrated = applyMigrations({
      schema_version: 2,
      created_at: "2026-02-19T00:00:00.000Z",
      data: {
        metadata: { schema_version: 2, created_at: "2026-02-19T00:00:00.000Z" },
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
          schemaVersion: 2
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
            weeklyHours: 1,
            githubRepo: null,
            remoteRepo: null,
            localRepoPath: null,
            healthScore: null,
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
        github: {
          loggedIn: false,
          user: null,
          lastSyncAt: null,
          rateLimit: null
        }
      }
    });

    expect(migrated.schema_version).toBe(SCHEMA_VERSION);
    expect(migrated.data.projects[0].createdAt).toBeTruthy();
    expect(migrated.data.projects[0].updatedAt).toBeTruthy();
  });
});
