import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStateSchema } from "../src/schema";
import { generateWeeklyReview } from "../src/weekly";

afterEach(() => {
  vi.useRealTimers();
});

describe("weekly review", () => {
  it("generates markdown recap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T10:00:00.000Z"));
    const state = AppStateSchema.parse({
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

    const review = generateWeeklyReview(state, "2026-02-16");
    expect(review.markdown).toContain("Weekly Review");
    expect(review.weekStart).toBe("2026-02-16");
    expect(review.markdown).toContain("Project Breakdown");
    expect(review.stats.roadmapMoved).toBe(0);
  });
});
