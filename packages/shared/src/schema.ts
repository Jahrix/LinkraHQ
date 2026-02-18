import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const DEFAULT_ACCENT = "#5DD8FF";
export const STREAK_THRESHOLD = 5;

export const RepoConfigSchema = z.object({
  repo: z.string().min(3),
  branch: z.string().min(1).default("main")
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  category: z.string().min(1),
  points: z.number().min(0),
  done: z.boolean(),
  createdAt: z.string(),
  completedAt: z.string().nullable()
});

export type Goal = z.infer<typeof GoalSchema>;

export const DailyGoalsEntrySchema = z.object({
  date: z.string(),
  goals: z.array(GoalSchema),
  score: z.number(),
  completedPoints: z.number(),
  archivedAt: z.string().nullable()
});

export type DailyGoalsEntry = z.infer<typeof DailyGoalsEntrySchema>;

export const RoadmapLaneSchema = z.enum(["now", "next", "later", "shipped"]);
export type RoadmapLane = z.infer<typeof RoadmapLaneSchema>;

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

export type RoadmapCard = z.infer<typeof RoadmapCardSchema>;

export const SessionLogSchema = z.object({
  id: z.string(),
  ts: z.string(),
  text: z.string().min(1),
  project: z.string().nullable(),
  tags: z.array(z.string()).default([])
});

export type SessionLog = z.infer<typeof SessionLogSchema>;

export const FocusSessionSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  durationMinutes: z.number(),
  completedAt: z.string().nullable()
});

export type FocusSession = z.infer<typeof FocusSessionSchema>;

export const QuickCaptureSchema = z.object({
  id: z.string(),
  type: z.enum(["note", "task", "roadmap"]),
  text: z.string(),
  createdAt: z.string()
});

export type QuickCapture = z.infer<typeof QuickCaptureSchema>;

export const UserSettingsSchema = z.object({
  theme: z.enum(["dark"]).default("dark"),
  accent: z.string().default(DEFAULT_ACCENT),
  reduceMotion: z.boolean().default(false),
  startOnLogin: z.boolean().default(false),
  selectedRepos: z.array(RepoConfigSchema).default([]),
  goalTemplate: z.array(GoalSchema).default([]),
  schemaVersion: z.number().default(SCHEMA_VERSION)
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

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

export type GithubState = z.infer<typeof GithubStateSchema>;

export const AppStateSchema = z.object({
  metadata: z.object({
    schema_version: z.number(),
    created_at: z.string()
  }),
  userSettings: UserSettingsSchema,
  dailyGoalsByDate: z.record(DailyGoalsEntrySchema),
  roadmapCards: z.array(RoadmapCardSchema),
  sessionLogs: z.array(SessionLogSchema),
  focusSessions: z.array(FocusSessionSchema),
  quickCaptures: z.array(QuickCaptureSchema),
  github: GithubStateSchema
});

export type AppState = z.infer<typeof AppStateSchema>;

export const ExportBundleSchema = z.object({
  schema_version: z.number(),
  created_at: z.string(),
  data: AppStateSchema
});

export type ExportBundle = z.infer<typeof ExportBundleSchema>;
