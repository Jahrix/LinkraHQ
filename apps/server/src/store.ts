import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  AppState,
  AppStateSchema,
  SCHEMA_VERSION,
  DEFAULT_ACCENT,
  computeGoalMetrics,
  todayKey
} from "@linkra/shared";

interface Database {
  state: AppState;
}

const DATA_DIR = process.env.LINKRA_DATA_DIR || path.join(os.homedir(), ".linkra");
const DB_FILE = path.join(DATA_DIR, "linkra-db.json");

const seedProjects = ["CruiseControl", "Indus Gaming Command", "Olympia Metropolis Web"];

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
      schemaVersion: SCHEMA_VERSION
    },
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
        project: seedProjects[0],
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
        project: seedProjects[1],
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
        project: seedProjects[2],
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
    github: {
      loggedIn: false,
      user: null,
      lastSyncAt: null,
      rateLimit: null
    }
  };
}

const adapter = new JSONFile<Database>(DB_FILE);
const db = new Low<Database>(adapter);

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

export function ensureDailyGoals() {
  const state = db.data!.state;
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
}

export function normalizeState(state: AppState): AppState {
  const parsed = AppStateSchema.safeParse(state);
  if (parsed.success) {
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
    dailyGoalsByDate: state.dailyGoalsByDate || fallback.dailyGoalsByDate,
    roadmapCards: state.roadmapCards || fallback.roadmapCards,
    sessionLogs: state.sessionLogs || fallback.sessionLogs,
    focusSessions: state.focusSessions || fallback.focusSessions,
    quickCaptures: state.quickCaptures || fallback.quickCaptures,
    github: {
      ...fallback.github,
      ...state.github
    }
  } as AppState;
}

export function mergeStates(current: AppState, incoming: AppState): AppState {
  const merged: AppState = {
    ...current,
    ...incoming,
    userSettings: {
      ...current.userSettings,
      selectedRepos: mergeArrayByKey(current.userSettings.selectedRepos, incoming.userSettings.selectedRepos, "repo"),
      goalTemplate: incoming.userSettings.goalTemplate.length ? incoming.userSettings.goalTemplate : current.userSettings.goalTemplate,
      accent: incoming.userSettings.accent || current.userSettings.accent,
      reduceMotion: incoming.userSettings.reduceMotion ?? current.userSettings.reduceMotion,
      startOnLogin: incoming.userSettings.startOnLogin ?? current.userSettings.startOnLogin
    },
    dailyGoalsByDate: {
      ...current.dailyGoalsByDate,
      ...incoming.dailyGoalsByDate
    },
    roadmapCards: mergeArrayById(current.roadmapCards, incoming.roadmapCards),
    sessionLogs: mergeArrayById(current.sessionLogs, incoming.sessionLogs),
    focusSessions: mergeArrayById(current.focusSessions, incoming.focusSessions),
    quickCaptures: mergeArrayById(current.quickCaptures, incoming.quickCaptures)
  };

  return normalizeState(merged);
}

function mergeArrayById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
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
