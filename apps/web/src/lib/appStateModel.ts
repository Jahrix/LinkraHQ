import {
  AppStateSchema,
  SCHEMA_VERSION,
  applyMigrations,
  computeGoalMetrics,
  createDefaultAppState as createSharedDefaultAppState,
  todayKey,
  type AppState,
  type ExportBundle
} from "@linkra/shared";

export type ImportMode = "replace" | "merge_keep" | "merge_overwrite";

export const cloneAppState = (state: AppState): AppState =>
  AppStateSchema.parse(structuredClone(state));

export const createDefaultAppState = (nowIso = new Date().toISOString()): AppState => {
  let goalIndex = 0;
  return AppStateSchema.parse(
    createSharedDefaultAppState({
      now: nowIso,
      createId: () => {
        goalIndex += 1;
        return `g${goalIndex}`;
      }
    })
  );
};

export const createExportBundle = (state: AppState, createdAt = new Date().toISOString()): ExportBundle => {
  const clone = cloneAppState(state);
  clone.userSettings.githubPat = null;
  return {
    schema_version: SCHEMA_VERSION,
    created_at: createdAt,
    data: clone
  };
};

export const applyImportBundle = (
  current: AppState,
  bundle: ExportBundle | Record<string, unknown>,
  mode: ImportMode
): AppState => {
  const migrated = applyMigrations(bundle);
  const incoming = cloneAppState(migrated.data);

  if (mode === "replace") {
    return incoming;
  }

  return mergeAppStates(current, incoming, mode === "merge_overwrite");
};

export const createWipedAppState = (current?: AppState): AppState => {
  const fresh = createDefaultAppState();
  if (!current) {
    return fresh;
  }

  return {
    ...fresh,
    github: cloneAppState(current).github
  };
};

export const normalizeRuntimeAppState = (state: AppState, now = new Date()): AppState => {
  const next = cloneAppState(state);
  const nowIso = now.toISOString();
  const today = todayKey(now);

  next.userSettings.theme = "dark";

  if (!next.dailyGoalsByDate[today]) {
    const goals = next.userSettings.goalTemplate.map((goal) => ({
      ...goal,
      id: crypto.randomUUID(),
      done: false,
      createdAt: nowIso,
      completedAt: null
    }));
    const metrics = computeGoalMetrics(goals);
    next.dailyGoalsByDate[today] = {
      date: today,
      goals,
      score: metrics.score,
      completedPoints: metrics.completedPoints,
      isClosed: false,
      archivedAt: null
    };
  }

  for (const [date, entry] of Object.entries(next.dailyGoalsByDate)) {
    if (date !== today && !entry.archivedAt) {
      entry.archivedAt = nowIso;
    }
  }

  const todayMetrics = computeGoalMetrics(next.dailyGoalsByDate[today].goals);
  next.dailyGoalsByDate[today].score = todayMetrics.score;
  next.dailyGoalsByDate[today].completedPoints = todayMetrics.completedPoints;

  return next;
};

export const mergeAppStates = (
  current: AppState,
  incoming: AppState,
  preferIncoming: boolean
): AppState =>
  AppStateSchema.parse({
    ...current,
    ...incoming,
    userSettings: {
      ...current.userSettings,
      selectedRepos: mergeArrayByKey(
        current.userSettings.selectedRepos,
        incoming.userSettings.selectedRepos,
        "repo"
      ),
      goalTemplate: incoming.userSettings.goalTemplate.length
        ? incoming.userSettings.goalTemplate
        : current.userSettings.goalTemplate,
      accent: incoming.userSettings.accent || current.userSettings.accent,
      reduceMotion: incoming.userSettings.reduceMotion ?? current.userSettings.reduceMotion,
      startOnLogin: incoming.userSettings.startOnLogin ?? current.userSettings.startOnLogin,
      repoWatchDirs: incoming.userSettings.repoWatchDirs.length
        ? incoming.userSettings.repoWatchDirs
        : current.userSettings.repoWatchDirs,
      repoScanIntervalMinutes:
        incoming.userSettings.repoScanIntervalMinutes ?? current.userSettings.repoScanIntervalMinutes,
      repoExcludePatterns: incoming.userSettings.repoExcludePatterns.length
        ? incoming.userSettings.repoExcludePatterns
        : current.userSettings.repoExcludePatterns,
      gitWatcherEnabled: incoming.userSettings.gitWatcherEnabled ?? current.userSettings.gitWatcherEnabled,
      disabledInsightRules: incoming.userSettings.disabledInsightRules.length
        ? incoming.userSettings.disabledInsightRules
        : current.userSettings.disabledInsightRules,
      enableDailyBackup: incoming.userSettings.enableDailyBackup ?? current.userSettings.enableDailyBackup,
      backupRetentionDays: incoming.userSettings.backupRetentionDays ?? current.userSettings.backupRetentionDays,
      schemaVersion: SCHEMA_VERSION
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
    },
    metadata: {
      ...incoming.metadata,
      schema_version: SCHEMA_VERSION
    }
  });

const mergeArrayById = <T extends { id: string }>(base: T[], incoming: T[], preferIncoming: boolean): T[] => {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (preferIncoming || !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
};

const mergeArrayByKey = <T extends Record<string, unknown>, K extends keyof T>(
  base: T[],
  incoming: T[],
  key: K
): T[] => {
  const map = new Map(base.map((item) => [item[key], item]));
  for (const item of incoming) {
    map.set(item[key], item);
  }
  return Array.from(map.values());
};
