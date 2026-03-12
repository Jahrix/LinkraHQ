import { DEFAULT_ACCENT, SCHEMA_VERSION } from "./schema.js";
import { computeGoalMetrics, todayKey } from "./utils.js";
const DEFAULT_GOAL_TEMPLATE = [
    { title: "Ship one focused task", category: "Build", points: 3 },
    { title: "Check GitHub commits", category: "Review", points: 2 },
    { title: "Write session log", category: "Reflect", points: 1 }
];
const fallbackId = () => `goal-${Math.random().toString(36).slice(2, 10)}`;
const resolveNow = (value) => {
    if (!value)
        return new Date();
    if (value instanceof Date)
        return new Date(value);
    return new Date(value);
};
const cloneGoal = ({ goal, now, createId }) => ({
    id: createId(),
    title: goal.title,
    category: goal.category,
    points: goal.points,
    done: false,
    createdAt: now,
    completedAt: null
});
export const createDefaultAppState = (options = {}) => {
    const nowDate = resolveNow(options.now);
    const now = nowDate.toISOString();
    const today = todayKey(nowDate);
    const createId = options.createId ?? fallbackId;
    const goalSeed = options.goalTemplate?.length ? options.goalTemplate : DEFAULT_GOAL_TEMPLATE;
    const goalTemplate = goalSeed.map((goal) => cloneGoal({ goal, now, createId }));
    const dailyGoals = goalSeed.map((goal) => cloneGoal({ goal, now, createId }));
    const metrics = computeGoalMetrics(dailyGoals);
    return {
        metadata: {
            schema_version: SCHEMA_VERSION,
            created_at: now
        },
        userSettings: {
            theme: "dark",
            accent: options.accent ?? DEFAULT_ACCENT,
            reduceMotion: false,
            startOnLogin: false,
            selectedRepos: [],
            goalTemplate,
            repoWatchDirs: options.repoWatchDirs ?? [],
            repoScanIntervalMinutes: 15,
            repoExcludePatterns: ["**/node_modules/**", "**/.git/**"],
            gitWatcherEnabled: options.gitWatcherEnabled ?? false,
            githubPat: null,
            disabledInsightRules: [],
            enableDailyBackup: options.enableDailyBackup ?? false,
            backupRetentionDays: options.backupRetentionDays ?? 14,
            schemaVersion: SCHEMA_VERSION
        },
        projects: [],
        localRepos: [],
        dailyGoalsByDate: {
            [today]: {
                date: today,
                goals: dailyGoals,
                score: metrics.score,
                completedPoints: metrics.completedPoints,
                isClosed: false,
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
        github: {
            loggedIn: false,
            user: null,
            lastSyncAt: null,
            rateLimit: null
        }
    };
};
