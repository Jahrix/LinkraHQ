import { describe, expect, it } from "vitest";
import { AppStateSchema } from "../src/schema";
import { generateWeeklyReview } from "../src/weekly";

describe("weekly review", () => {
  it("generates markdown recap", () => {
    const state = AppStateSchema.parse({
      metadata: { schema_version: 2, created_at: new Date().toISOString() },
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
  });
});
