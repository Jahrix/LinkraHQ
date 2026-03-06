import { describe, expect, it } from "vitest";
import { AppStateSchema } from "@linkra/shared";
import { applyDailyRollover } from "../src/store";
import { todayKey } from "@linkra/shared";

describe("daily rollover", () => {
  it("archives previous day and creates today entry", () => {
    // Create a date for yesterday in local time, formatted as YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      dailyGoalsByDate: {
        [yesterday]: {
          date: yesterday,
          goals: [],
          score: 0,
          completedPoints: 0,
          archivedAt: null
        }
      },
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

    const next = applyDailyRollover(state);
    const today = todayKey();
    expect(next.dailyGoalsByDate[today]).toBeDefined();
    expect(next.dailyGoalsByDate[yesterday].archivedAt).not.toBeNull();
  });
});
