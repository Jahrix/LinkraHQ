import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStateSchema } from "../src/schema";
import { computeStreak } from "../src/utils";
import { generateWeeklyReview } from "../src/weekly";

afterEach(() => {
  vi.useRealTimers();
});

function buildState(overrides: Partial<ReturnType<typeof AppStateSchema.parse>> = {}) {
  const now = "2026-02-19T10:00:00.000Z";
  return AppStateSchema.parse({
    metadata: { schema_version: 3, created_at: now },
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
    github: { loggedIn: false, user: null, lastSyncAt: null, rateLimit: null },
    ...overrides
  });
}

describe("weekly review", () => {
  it("generates markdown recap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T10:00:00.000Z"));
    const state = buildState({
      metadata: { schema_version: 3, created_at: new Date().toISOString() }
    });

    const review = generateWeeklyReview(state, "2026-02-16");
    expect(review.markdown).toContain("Weekly Review");
    expect(review.weekStart).toBe("2026-02-16");
    expect(review.markdown).toContain("Project Breakdown");
    expect(review.stats.roadmapMoved).toBe(0);
  });

  it("uses the streak threshold instead of a percentage score", () => {
    const state = buildState({
      dailyGoalsByDate: {
        "2026-02-16": {
          date: "2026-02-16",
          goals: [],
          score: 5,
          completedPoints: 5,
          archivedAt: null
        },
        "2026-02-17": {
          date: "2026-02-17",
          goals: [],
          score: 4,
          completedPoints: 4,
          archivedAt: null
        },
        "2026-02-18": {
          date: "2026-02-18",
          goals: [],
          score: 7,
          completedPoints: 7,
          archivedAt: null
        }
      }
    });

    const review = generateWeeklyReview(state, "2026-02-16");

    expect(review.stats.streakDelta).toBe(2);
  });

  it("counts linked commits in the week of the actual commit date", () => {
    const state = buildState({
      projects: [
        {
          id: "p1",
          name: "Linkra",
          subtitle: "",
          icon: "🧩",
          color: "#5DD8FF",
          status: "In Progress",
          progress: 0,
          weeklyHours: 5,
          githubRepo: null,
          remoteRepo: null,
          localRepoPath: null,
          healthScore: null,
          archivedAt: null,
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-20T00:00:00.000Z",
          tasks: [
            {
              id: "t1",
              text: "Link commit later",
              done: true,
              status: "done",
              dependsOnIds: [],
              priority: "med",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-18T00:00:00.000Z",
              completedAt: "2026-02-20T00:00:00.000Z",
              linkedCommit: {
                sha: "abc123",
                shortSha: "abc123",
                message: "feat: historical commit",
                author: "dev",
                date: "2026-02-10T12:00:00.000Z",
                url: null,
                score: 1
              }
            }
          ]
        }
      ]
    });

    expect(generateWeeklyReview(state, "2026-02-09").stats.commitsCount).toBe(1);
    expect(generateWeeklyReview(state, "2026-02-16").stats.commitsCount).toBe(0);
  });

  it("does not double count repo fallback commits when the week already has linked commits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T10:00:00.000Z"));

    const state = buildState({
      projects: [
        {
          id: "p1",
          name: "Linkra",
          subtitle: "",
          icon: "🧩",
          color: "#5DD8FF",
          status: "In Progress",
          progress: 0,
          weeklyHours: 5,
          githubRepo: null,
          remoteRepo: null,
          localRepoPath: "/repos/linkra",
          healthScore: null,
          archivedAt: null,
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
          tasks: [
            {
              id: "t1",
              text: "Ship commit",
              done: true,
              status: "done",
              dependsOnIds: [],
              priority: "med",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-19T08:30:00.000Z",
              completedAt: "2026-02-19T09:30:00.000Z",
              linkedCommit: {
                sha: "def456",
                shortSha: "def456",
                message: "feat: ship it",
                author: "dev",
                date: "2026-02-19T08:00:00.000Z",
                url: null,
                score: 1
              }
            }
          ]
        }
      ],
      localRepos: [
        {
          id: "repo-1",
          name: "Linkra",
          path: "/repos/linkra",
          watchDir: null,
          remoteUrl: null,
          defaultBranch: "main",
          lastCommitAt: "2026-02-19T09:00:00.000Z",
          lastCommitMessage: "feat: ship it",
          lastCommitAuthor: "dev",
          dirty: false,
          untrackedCount: 0,
          ahead: 0,
          behind: 0,
          todayCommitCount: 1,
          lastHeadSha: "def456",
          lastStatusHash: null,
          lastScanDurationMs: null,
          scanError: null,
          scannedAt: "2026-02-19T09:05:00.000Z"
        }
      ]
    });

    const review = generateWeeklyReview(state, "2026-02-16");

    expect(review.stats.commitsCount).toBe(1);
    expect(review.perProject[0]?.commitsCount).toBe(1);
  });

  it("breaks streaks across missing calendar days", () => {
    expect(
      computeStreak([
        {
          date: "2026-02-19",
          goals: [],
          score: 6,
          completedPoints: 6,
          archivedAt: null
        },
        {
          date: "2026-02-17",
          goals: [],
          score: 5,
          completedPoints: 5,
          archivedAt: null
        }
      ])
    ).toBe(1);
  });
});
