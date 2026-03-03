import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  AppState,
  AppStateSchema,
  SCHEMA_VERSION,
  DEFAULT_ACCENT,
  computeGoalMetrics,
  todayKey,
  type Project,
  type ProjectTask
} from "@linkra/shared";

interface Database {
  state: AppState;
}

const DATA_DIR = process.env.LINKRA_DATA_DIR || path.join(os.homedir(), ".linkra");
const DB_FILE = path.join(DATA_DIR, "linkra-db.json");

const seedProjects = [
  { name: "CruiseControl", subtitle: "Ops control suite", color: "#60a5fa", icon: "🛰️" },
  { name: "Indus Gaming Command", subtitle: "Gaming HQ dashboard", color: "#a855f7", icon: "🕹️" },
  { name: "Olympia Metropolis Web", subtitle: "City web experience", color: "#22c55e", icon: "🌆" },
  { name: "Video Editing", subtitle: "Post-production pipeline", color: "#f97316", icon: "🎬" },
  { name: "Tools Lab", subtitle: "Internal tooling", color: "#14b8a6", icon: "🧪" }
];

const VALID_PROJECT_STATUSES = new Set([
  "Not Started",
  "In Progress",
  "Review",
  "On Hold",
  "Done",
  "Archived"
]);

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function newGoal(title: string, category: string, points: number) {
  return {
    id: nanoid(),
    title,
    category,
    points,
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

function newTask(text: string, dueDate: string | null): ProjectTask {
  return {
    id: nanoid(),
    text,
    done: false,
    status: "todo",
    dependsOnIds: [],
    priority: "med",
    dueDate,
    milestone: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    linkedCommit: null
  };
}

function newProject({
  name,
  subtitle,
  color,
  icon,
  status,
  weeklyHours,
  githubRepo
}: {
  name: string;
  subtitle: string;
  color: string;
  icon: string;
  status: "Not Started" | "In Progress" | "Review" | "On Hold" | "Done" | "Archived";
  weeklyHours: number;
  githubRepo: string | null;
}): Project {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name,
    subtitle,
    icon,
    color,
    status,
    progress: 0,
    weeklyHours,
    githubRepo,
    remoteRepo: githubRepo,
    localRepoPath: null,
    healthScore: null,
    archivedAt: status === "Archived" ? now : null,
    createdAt: now,
    updatedAt: now,
    tasks: [] as ProjectTask[]
  };
}

function defaultState(): AppState {
  const now = new Date().toISOString();
  const goalTemplate = [
    newGoal("Ship one focused task", "Build", 3),
    newGoal("Check GitHub commits", "Review", 2),
    newGoal("Write session log", "Reflect", 1)
  ];

  const today = todayKey();
  const goals = goalTemplate.map((goal) => ({ ...goal, id: nanoid(), createdAt: now }));
  const metrics = computeGoalMetrics(goals);

  const projects = [
    newProject({
      name: seedProjects[0].name,
      subtitle: seedProjects[0].subtitle,
      color: seedProjects[0].color,
      icon: seedProjects[0].icon,
      status: "In Progress",
      weeklyHours: 8,
      githubRepo: null
    }),
    newProject({
      name: seedProjects[1].name,
      subtitle: seedProjects[1].subtitle,
      color: seedProjects[1].color,
      icon: seedProjects[1].icon,
      status: "In Progress",
      weeklyHours: 6,
      githubRepo: null
    }),
    newProject({
      name: seedProjects[2].name,
      subtitle: seedProjects[2].subtitle,
      color: seedProjects[2].color,
      icon: seedProjects[2].icon,
      status: "Not Started",
      weeklyHours: 4,
      githubRepo: null
    }),
    newProject({
      name: seedProjects[3].name,
      subtitle: seedProjects[3].subtitle,
      color: seedProjects[3].color,
      icon: seedProjects[3].icon,
      status: "In Progress",
      weeklyHours: 3,
      githubRepo: null
    }),
    newProject({
      name: seedProjects[4].name,
      subtitle: seedProjects[4].subtitle,
      color: seedProjects[4].color,
      icon: seedProjects[4].icon,
      status: "Not Started",
      weeklyHours: 2,
      githubRepo: null
    })
  ];

  projects[0].tasks = [
    newTask("Define release checklist", null),
    newTask("Audit logging pipeline", null),
    newTask("Ship v0.1 release", null)
  ];

  projects[1].tasks = [
    newTask("Draft dashboard layout", null),
    newTask("Integrate OAuth flow", null)
  ];

  projects[3].tasks = [
    newTask("Edit sequence A-roll", null)
  ];

  const defaultWatchDir = path.join(os.homedir(), "Developer");

  return {
    metadata: {
      schema_version: SCHEMA_VERSION,
      created_at: now
    },
    userSettings: {
      theme: "dark",
      accent: DEFAULT_ACCENT,
      reduceMotion: false,
      startOnLogin: false,
      selectedRepos: [],
      goalTemplate,
      repoWatchDirs: fs.existsSync(defaultWatchDir) ? [defaultWatchDir] : [],
      repoScanIntervalMinutes: 15,
      repoExcludePatterns: ["**/node_modules/**", "**/.git/**"],
      gitWatcherEnabled: true,
      disabledInsightRules: [],
      enableDailyBackup: true,
      backupRetentionDays: 14,
      schemaVersion: SCHEMA_VERSION
    },
    projects,
    localRepos: [],
    dailyGoalsByDate: {
      [today]: {
        date: today,
        goals,
        score: metrics.score,
        completedPoints: metrics.completedPoints,
        archivedAt: null
      }
    },
    roadmapCards: [
      {
        id: nanoid(),
        lane: "now",
        title: "Launch Linkra MVP",
        description: "Ship local-first glassmorphism UI with daily goals and roadmap.",
        tags: ["linkra", "v0.1"],
        linkedRepo: null,
        dueDate: null,
        project: projects[0].id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        lane: "next",
        title: "Integrate GitHub OAuth",
        description: "Secure session + commits feed.",
        tags: ["oauth", "github"],
        linkedRepo: null,
        dueDate: null,
        project: projects[1].id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        lane: "later",
        title: "Add mobile companion",
        description: "Read-only glass dashboard for tablet mode.",
        tags: ["mobile"],
        linkedRepo: null,
        dueDate: null,
        project: projects[2].id,
        createdAt: now,
        updatedAt: now
      }
    ],
    sessionLogs: [
      {
        id: nanoid(),
        ts: now,
        text: "Bootstrapped Linkra local data.",
        project: null,
        tags: ["seed"]
      }
    ],
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
}

const adapter = new JSONFile<Database>(DB_FILE);
const db = new Low<Database>(adapter, { state: defaultState() });

export async function loadStore() {
  ensureDir();
  await db.read();
  if (!db.data) {
    db.data = { state: defaultState() };
    await db.write();
  } else {
    db.data.state = normalizeState(db.data.state);
    await db.write();
  }
}

export function getState(): AppState {
  return db.data!.state;
}

export async function saveState(state: AppState) {
  db.data!.state = normalizeState(state);
  await db.write();
}

export async function wipeState() {
  db.data!.state = defaultState();
  await db.write();
}

export function applyDailyRollover(state: AppState) {
  const today = todayKey();
  const entry = state.dailyGoalsByDate[today];

  if (!entry) {
    const now = new Date().toISOString();
    const template = state.userSettings.goalTemplate;
    const goals = template.map((goal) => ({
      ...goal,
      id: nanoid(),
      done: false,
      createdAt: now,
      completedAt: null
    }));
    const metrics = computeGoalMetrics(goals);
    state.dailyGoalsByDate[today] = {
      date: today,
      goals,
      score: metrics.score,
      completedPoints: metrics.completedPoints,
      archivedAt: null
    };
  }

  for (const [date, daily] of Object.entries(state.dailyGoalsByDate)) {
    if (date !== today && !daily.archivedAt) {
      daily.archivedAt = new Date().toISOString();
    }
  }

  const metrics = computeGoalMetrics(state.dailyGoalsByDate[today].goals);
  state.dailyGoalsByDate[today].completedPoints = metrics.completedPoints;
  state.dailyGoalsByDate[today].score = metrics.score;
  return state;
}

export function ensureDailyGoals() {
  const state = db.data!.state;
  db.data!.state = applyDailyRollover(state);
}

export function normalizeState(state: AppState): AppState {
  const parsed = AppStateSchema.safeParse(state);
  if (parsed.success) {
    parsed.data.localRepos = dedupeLocalRepos(parsed.data.localRepos);
    return parsed.data;
  }

  const fallback = defaultState();
  return {
    ...fallback,
    ...state,
    metadata: {
      schema_version: SCHEMA_VERSION,
      created_at: state.metadata?.created_at || fallback.metadata.created_at
    },
    userSettings: {
      ...fallback.userSettings,
      ...state.userSettings
    },
    projects: (state.projects || fallback.projects).map((project) => ({
      ...project,
      status: VALID_PROJECT_STATUSES.has(project.status) ? project.status : "Not Started",
      remoteRepo: project.remoteRepo ?? project.githubRepo ?? null,
      localRepoPath: project.localRepoPath ?? null,
      healthScore: project.healthScore ?? null,
      archivedAt: project.status === "Archived" ? project.archivedAt ?? new Date().toISOString() : null,
      createdAt: project.createdAt ?? state.metadata?.created_at ?? fallback.metadata.created_at,
      updatedAt: project.updatedAt ?? new Date().toISOString()
    })),
    localRepos: dedupeLocalRepos(state.localRepos || fallback.localRepos),
    dailyGoalsByDate: state.dailyGoalsByDate || fallback.dailyGoalsByDate,
    roadmapCards: state.roadmapCards || fallback.roadmapCards,
    sessionLogs: state.sessionLogs || fallback.sessionLogs,
    focusSessions: state.focusSessions || fallback.focusSessions,
    quickCaptures: state.quickCaptures || fallback.quickCaptures,
    journalEntries: state.journalEntries || fallback.journalEntries,
    insights: state.insights || fallback.insights,
    weeklyReviews: state.weeklyReviews || fallback.weeklyReviews,
    weeklySnapshots: state.weeklySnapshots || fallback.weeklySnapshots,
    todayPlanByDate: state.todayPlanByDate || fallback.todayPlanByDate,
    github: {
      ...fallback.github,
      ...state.github
    }
  } as AppState;
}

function normalizeRepoPath(repoPath: string) {
  const resolvedPath = path.resolve(repoPath);
  const suffix: string[] = [];
  let current = resolvedPath;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return resolvedPath;
    }
    suffix.unshift(path.basename(current));
    current = parent;
  }

  try {
    return path.join(fs.realpathSync.native(current), ...suffix);
  } catch {
    return resolvedPath;
  }
}

function stableRepoId(repoPath: string) {
  return crypto.createHash("sha1").update(normalizeRepoPath(repoPath)).digest("hex");
}

function scanTime(scannedAt: string | null) {
  if (!scannedAt) return 0;
  const ms = new Date(scannedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function dedupeLocalRepos(repos: AppState["localRepos"]) {
  const byPath = new Map<string, (typeof repos)[number]>();
  for (const repo of repos) {
    const normalizedPath = normalizeRepoPath(repo.path);
    const candidate = {
      ...repo,
      id: stableRepoId(normalizedPath),
      path: normalizedPath,
      watchDir: repo.watchDir ? normalizeRepoPath(repo.watchDir) : null
    };
    const existing = byPath.get(normalizedPath);
    if (!existing || scanTime(candidate.scannedAt) >= scanTime(existing.scannedAt)) {
      byPath.set(normalizedPath, candidate);
    }
  }
  return Array.from(byPath.values());
}

export function mergeStates(current: AppState, incoming: AppState, preferIncoming = true): AppState {
  const merged: AppState = {
    ...current,
    ...incoming,
    userSettings: {
      ...current.userSettings,
      selectedRepos: mergeArrayByKey(current.userSettings.selectedRepos, incoming.userSettings.selectedRepos, "repo"),
      goalTemplate: incoming.userSettings.goalTemplate.length ? incoming.userSettings.goalTemplate : current.userSettings.goalTemplate,
      accent: incoming.userSettings.accent || current.userSettings.accent,
      reduceMotion: incoming.userSettings.reduceMotion ?? current.userSettings.reduceMotion,
      startOnLogin: incoming.userSettings.startOnLogin ?? current.userSettings.startOnLogin,
      repoWatchDirs: incoming.userSettings.repoWatchDirs?.length
        ? incoming.userSettings.repoWatchDirs
        : current.userSettings.repoWatchDirs,
      repoScanIntervalMinutes: incoming.userSettings.repoScanIntervalMinutes ?? current.userSettings.repoScanIntervalMinutes,
      repoExcludePatterns: incoming.userSettings.repoExcludePatterns?.length
        ? incoming.userSettings.repoExcludePatterns
        : current.userSettings.repoExcludePatterns,
      gitWatcherEnabled: incoming.userSettings.gitWatcherEnabled ?? current.userSettings.gitWatcherEnabled,
      disabledInsightRules: incoming.userSettings.disabledInsightRules?.length
        ? incoming.userSettings.disabledInsightRules
        : current.userSettings.disabledInsightRules,
      enableDailyBackup: incoming.userSettings.enableDailyBackup ?? current.userSettings.enableDailyBackup,
      backupRetentionDays: incoming.userSettings.backupRetentionDays ?? current.userSettings.backupRetentionDays
    },
    dailyGoalsByDate: {
      ...current.dailyGoalsByDate,
      ...incoming.dailyGoalsByDate
    },
    projects: mergeArrayById(current.projects, incoming.projects, preferIncoming),
    localRepos: mergeArrayById(current.localRepos, incoming.localRepos, preferIncoming),
    roadmapCards: mergeArrayById(current.roadmapCards, incoming.roadmapCards, preferIncoming),
    sessionLogs: mergeArrayById(current.sessionLogs, incoming.sessionLogs, preferIncoming),
    focusSessions: mergeArrayById(current.focusSessions, incoming.focusSessions, preferIncoming),
    quickCaptures: mergeArrayById(current.quickCaptures, incoming.quickCaptures, preferIncoming),
    journalEntries: mergeArrayById(current.journalEntries, incoming.journalEntries, preferIncoming),
    insights: mergeArrayById(current.insights, incoming.insights, preferIncoming),
    weeklyReviews: mergeArrayById(current.weeklyReviews, incoming.weeklyReviews, preferIncoming),
    weeklySnapshots: mergeArrayById(current.weeklySnapshots, incoming.weeklySnapshots, preferIncoming),
    todayPlanByDate: {
      ...(preferIncoming ? current.todayPlanByDate : incoming.todayPlanByDate),
      ...(preferIncoming ? incoming.todayPlanByDate : current.todayPlanByDate)
    }
  };

  return normalizeState(merged);
}

function mergeArrayById<T extends { id: string }>(base: T[], incoming: T[], preferIncoming = true): T[] {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (preferIncoming || !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergeArrayByKey<T extends Record<string, any>>(base: T[], incoming: T[], key: keyof T): T[] {
  const map = new Map(base.map((item) => [item[key], item]));
  for (const item of incoming) {
    map.set(item[key], item);
  }
  return Array.from(map.values());
}

export function getDataDir() {
  return DATA_DIR;
}
