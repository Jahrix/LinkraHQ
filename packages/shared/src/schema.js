import { z } from "zod";
export const SCHEMA_VERSION = 3;
export const DEFAULT_ACCENT = "#5DD8FF";
export const STREAK_THRESHOLD = 5;
export const RepoConfigSchema = z.object({
    repo: z.string().min(3),
    branch: z.string().min(1).default("main")
});
export const GoalSchema = z.object({
    id: z.string(),
    title: z.string().min(1),
    category: z.string().min(1),
    points: z.number().min(0),
    done: z.boolean(),
    createdAt: z.string(),
    completedAt: z.string().nullable()
});
export const DailyGoalsEntrySchema = z.object({
    date: z.string(),
    goals: z.array(GoalSchema),
    score: z.number(),
    completedPoints: z.number(),
    isClosed: z.boolean().default(false),
    archivedAt: z.string().nullable()
});
export const RoadmapLaneSchema = z.enum(["now", "next", "later", "shipped"]);
export const RoadmapCardSchema = z.object({
    id: z.string(),
    lane: RoadmapLaneSchema,
    title: z.string().min(1),
    description: z.string().default(""),
    tags: z.array(z.string()).default([]),
    linkedRepo: z.string().nullable(),
    dueDate: z.string().nullable(),
    project: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
});
export const ProjectTaskSchema = z.object({
    id: z.string(),
    text: z.string().min(1),
    done: z.boolean(),
    status: z.enum(["todo", "doing", "done"]).default("todo"),
    dependsOnIds: z.array(z.string()).default([]),
    priority: z.enum(["low", "med", "high"]).default("med"),
    dueDate: z.string().nullable(),
    milestone: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
    linkedCommit: z
        .object({
        sha: z.string(),
        shortSha: z.string(),
        message: z.string(),
        author: z.string(),
        date: z.string(),
        url: z.string().nullable().default(null),
        score: z.number()
    })
        .nullable()
        .default(null)
});
export const ProjectSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    subtitle: z.string().default(""),
    icon: z.string().default("🧩"),
    color: z.string().default("#8b5cf6"),
    status: z
        .enum(["Not Started", "In Progress", "Review", "On Hold", "Done", "Archived"])
        .default("Not Started"),
    progress: z.number().min(0).max(100).default(0),
    weeklyHours: z.number().min(0).default(0),
    logoUrl: z.string().nullable().default(null),
    githubRepo: z.string().nullable(),
    remoteRepo: z.string().nullable().default(null),
    localRepoPath: z.string().nullable().default(null),
    healthScore: z.number().min(0).max(100).nullable().default(null),
    archivedAt: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string(),
    tasks: z.array(ProjectTaskSchema).default([])
});
export const LocalRepoSchema = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    watchDir: z.string().nullable().default(null),
    remoteUrl: z.string().nullable(),
    defaultBranch: z.string().nullable(),
    lastCommitAt: z.string().nullable(),
    lastCommitMessage: z.string().nullable(),
    lastCommitAuthor: z.string().nullable(),
    dirty: z.boolean(),
    untrackedCount: z.number(),
    ahead: z.number(),
    behind: z.number(),
    todayCommitCount: z.number(),
    lastHeadSha: z.string().nullable().default(null),
    lastStatusHash: z.string().nullable().default(null),
    lastScanDurationMs: z.number().nullable().default(null),
    scanError: z.string().nullable(),
    scannedAt: z.string().nullable()
});
export const SessionLogSchema = z.object({
    id: z.string(),
    ts: z.string(),
    text: z.string().min(1),
    project: z.string().nullable(),
    tags: z.array(z.string()).default([])
});
export const FocusSessionSchema = z.object({
    id: z.string(),
    startedAt: z.string(),
    durationMinutes: z.number(),
    completedAt: z.string().nullable(),
    planned: z.boolean().default(false),
    projectId: z.string().nullable().default(null),
    reason: z.string().nullable().default(null)
});
export const QuickCaptureSchema = z.object({
    id: z.string(),
    type: z.enum(["note", "task", "roadmap", "journal"]),
    text: z.string(),
    createdAt: z.string()
});
export const UserSettingsSchema = z.object({
    theme: z.enum(["dark"]).default("dark"),
    accent: z.string().default(DEFAULT_ACCENT),
    reduceMotion: z.boolean().default(false),
    startOnLogin: z.boolean().default(false),
    selectedRepos: z.array(RepoConfigSchema).default([]),
    goalTemplate: z.array(GoalSchema).default([]),
    repoWatchDirs: z.array(z.string()).default([]),
    repoScanIntervalMinutes: z.number().default(15),
    repoExcludePatterns: z.array(z.string()).default(["**/node_modules/**", "**/.git/**"]),
    gitWatcherEnabled: z.boolean().default(true),
    githubPat: z.string().nullable().default(null),
    disabledInsightRules: z.array(z.string()).default([]),
    enableDailyBackup: z.boolean().default(true),
    backupRetentionDays: z.number().default(14),
    schemaVersion: z.number().default(SCHEMA_VERSION)
});
export const GithubStateSchema = z.object({
    loggedIn: z.boolean(),
    user: z
        .object({
        login: z.string(),
        avatarUrl: z.string().nullable(),
        name: z.string().nullable()
    })
        .nullable(),
    lastSyncAt: z.string().nullable(),
    rateLimit: z
        .object({
        remaining: z.number(),
        reset: z.number()
    })
        .nullable()
});
export const SuggestedActionSchema = z.object({
    id: z.string(),
    type: z.enum([
        "CREATE_TASK",
        "SCHEDULE_FOCUS",
        "MOVE_ROADMAP_NOW",
        "MOVE_ROADMAP_CARD",
        "COPY_REPO_PATH",
        "OPEN_REPO",
        "SNOOZE_1D",
        "SNOOZE_1W",
        "DISMISS",
        "CREATE_JOURNAL",
        "ARCHIVE_PROJECT"
    ]),
    label: z.string(),
    payload: z.record(z.any()).default({})
});
export const InsightSchema = z.object({
    id: z.string(),
    ts: z.string(),
    severity: z.enum(["info", "warn", "crit"]),
    projectId: z.string().nullable().default(null),
    repoId: z.string().nullable().default(null),
    ruleId: z.string(),
    title: z.string(),
    reason: z.string(),
    metrics: z.record(z.any()).default({}),
    suggestedActions: z.array(SuggestedActionSchema).default([]),
    dismissedUntil: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string()
});
export const WeeklyReviewSchema = z.object({
    id: z.string(),
    weekStart: z.string(),
    weekEnd: z.string(),
    stats: z
        .object({
        goalsCompleted: z.number().default(0),
        points: z.number().default(0),
        tasksDone: z.number().default(0),
        tasksCreated: z.number().default(0),
        roadmapMoved: z.number().default(0),
        commitsCount: z.number().default(0),
        focusMinutes: z.number().default(0),
        journalCount: z.number().default(0),
        streakDelta: z.number().default(0)
    })
        .default({}),
    perProject: z
        .array(z.object({
        projectId: z.string(),
        projectName: z.string(),
        tasksDone: z.number().default(0),
        tasksCreated: z.number().default(0),
        commitsCount: z.number().default(0),
        focusMinutes: z.number().default(0),
        journalCount: z.number().default(0),
        roadmapMoved: z.number().default(0)
    }))
        .default([]),
    highlights: z.array(z.string()).default([]),
    markdown: z.string(),
    createdAt: z.string(),
    closedAt: z.string().nullable().default(null)
});
export const WeekSnapshotSchema = z.object({
    id: z.string(),
    weekStart: z.string(),
    weekEnd: z.string(),
    data: z.record(z.any()).default({})
});
export const JournalEntrySchema = z.object({
    id: z.string(),
    projectId: z.string().nullable().default(null),
    ts: z.string(),
    type: z.enum(["note", "decision", "blocker", "next", "idea"]),
    title: z.string().nullable().default(null),
    body: z.string(),
    links: z
        .object({
        taskIds: z.array(z.string()).default([]),
        roadmapCardIds: z.array(z.string()).default([]),
        repoIds: z.array(z.string()).default([]),
        commitShas: z.array(z.string()).default([])
    })
        .default({}),
    tags: z.array(z.string()).default([]),
    createdAt: z.string(),
    updatedAt: z.string()
});
export const TodayPlanSchema = z.object({
    taskIds: z.array(z.string()).default([]),
    generatedAt: z.string(),
    source: z.enum(["manual", "auto"]).default("auto"),
    notes: z.string().nullable().default(null)
});
export const AppStateSchema = z.object({
    metadata: z.object({
        schema_version: z.number(),
        created_at: z.string()
    }),
    userSettings: UserSettingsSchema,
    projects: z.array(ProjectSchema),
    localRepos: z.array(LocalRepoSchema).default([]),
    dailyGoalsByDate: z.record(DailyGoalsEntrySchema),
    roadmapCards: z.array(RoadmapCardSchema),
    sessionLogs: z.array(SessionLogSchema),
    focusSessions: z.array(FocusSessionSchema),
    quickCaptures: z.array(QuickCaptureSchema),
    journalEntries: z.array(JournalEntrySchema).default([]),
    insights: z.array(InsightSchema).default([]),
    weeklyReviews: z.array(WeeklyReviewSchema).default([]),
    weeklySnapshots: z.array(WeekSnapshotSchema).default([]),
    todayPlanByDate: z.record(TodayPlanSchema).default({}),
    github: GithubStateSchema
});
export const ExportBundleSchema = z.object({
    schema_version: z.number(),
    created_at: z.string(),
    data: AppStateSchema
});
