import { describe, expect, it } from "vitest";
import { createBuildPlanPrompt, parseBuildPlanResponse } from "../src/buildPlan";
import { AppStateSchema } from "../src/schema";

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
            dueDate: "2026-03-07",
            milestone: null,
            createdAt: "2026-03-08T10:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          },
          {
            id: "t2",
            text: "Verify Cloudflare deployment",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "med",
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
    roadmapCards: [
      {
        id: "r1",
        lane: "now",
        title: "Ship production fix",
        description: "",
        tags: [],
        linkedRepo: null,
        dueDate: null,
        project: "p1",
        createdAt: "2026-03-08T10:00:00.000Z",
        updatedAt: "2026-03-08T10:00:00.000Z"
      }
    ],
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

describe("build plan helpers", () => {
  it("creates a prompt with only open active-project tasks", () => {
    const prompt = createBuildPlanPrompt(buildState(), new Date("2026-03-08T10:00:00.000Z"));

    expect(prompt.today).toBe("2026-03-08");
    expect(prompt.tasks).toHaveLength(2);
    expect(prompt.tasks[0]?.isOverdue).toBe(true);
    expect(prompt.userMessage).toContain("Ship production fix");
  });

  it("parses Claude JSON and filters unknown task ids", () => {
    const parsed = parseBuildPlanResponse(
      "```json\n{\"taskIds\":[\"t1\",\"missing\",\"t2\"],\"rationale\":\"Ship the production fix first.\"}\n```",
      ["t1", "t2"]
    );

    expect(parsed).toEqual({
      taskIds: ["t1", "t2"],
      rationale: "Ship the production fix first."
    });
  });
});
