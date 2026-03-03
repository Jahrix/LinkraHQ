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
        journalEntries: [
          {
            id: "j1",
            projectId: "p1",
            ts: "2026-02-19T02:00:00.000Z",
            type: "decision",
            title: "Shipped",
            body: "Documented a release decision",
            createdAt: "2026-02-19T02:00:00.000Z",
            updatedAt: "2026-02-19T02:00:00.000Z"
          }
        ],
        insights: [],
        weeklyReviews: [
          {
            id: "w1",
            weekStart: "2026-02-16",
            weekEnd: "2026-02-22",
            stats: {
              goalsCompleted: 1,
              points: 2,
              tasksDone: 3,
              tasksCreated: 1,
              roadmapMoved: 0,
              commitsCount: 0,
              focusMinutes: 30,
              journalCount: 1,
              streakDelta: 1
            },
            perProject: [
              {
                projectId: "p1",
                projectName: "Project",
                tasksDone: 3,
                tasksCreated: 1,
                commitsCount: 0,
                focusMinutes: 30,
                journalCount: 1
              }
            ],
            markdown: "# Weekly Review",
            createdAt: "2026-02-19T02:00:00.000Z"
          }
        ],
        weeklySnapshots: [
          {
            id: "s1",
            weekStart: "2026-02-16",
            weekEnd: "2026-02-22"
          }
        ],
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
    expect(migrated.data.journalEntries[0].links.taskIds).toEqual([]);
    expect(migrated.data.weeklyReviews[0].perProject[0].roadmapMoved).toBe(0);
    expect(migrated.data.weeklySnapshots[0].data).toEqual({});
  });
});
