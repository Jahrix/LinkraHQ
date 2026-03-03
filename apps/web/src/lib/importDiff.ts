import type { AppState } from "@linkra/shared";
import { dedupeById } from "./collections";

export type ImportEntityDiff = {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  conflicts: number;
  duplicates: {
    current: number;
    incoming: number;
  };
};

export type ImportDiffResult = {
  projects: ImportEntityDiff;
  tasks: ImportEntityDiff;
  roadmap: ImportEntityDiff;
  journal: ImportEntityDiff;
  weeklyReviews: ImportEntityDiff;
  weeklySnapshots: ImportEntityDiff;
  localRepos: ImportEntityDiff;
  focusSessions: ImportEntityDiff;
  summary: {
    additions: number;
    changes: number;
    removals: number;
    conflicts: number;
  };
  warnings: string[];
};

function diffArray<T extends { id: string }>(base: T[], next: T[], label: string, warnings: string[]): ImportEntityDiff {
  const dedupedBase = dedupeById(base);
  const dedupedNext = dedupeById(next);
  const baseMap = new Map(dedupedBase.items.map((item) => [item.id, item]));
  const nextMap = new Map(dedupedNext.items.map((item) => [item.id, item]));

  let added = 0;
  let changed = 0;
  let removed = 0;
  let unchanged = 0;

  for (const [id, item] of nextMap) {
    if (!baseMap.has(id)) {
      added += 1;
      continue;
    }

    if (JSON.stringify(baseMap.get(id)) === JSON.stringify(item)) {
      unchanged += 1;
    } else {
      changed += 1;
    }
  }

  for (const id of baseMap.keys()) {
    if (!nextMap.has(id)) removed += 1;
  }

  if (dedupedBase.duplicates.length > 0) {
    warnings.push(`${label}: ${dedupedBase.duplicates.length} duplicate IDs already exist locally. Lists will be deduped in the UI.`);
  }
  if (dedupedNext.duplicates.length > 0) {
    warnings.push(`${label}: ${dedupedNext.duplicates.length} duplicate IDs were found in the import file. Preview counts use the first copy per ID.`);
  }

  return {
    added,
    changed,
    removed,
    unchanged,
    conflicts: changed,
    duplicates: {
      current: dedupedBase.duplicates.length,
      incoming: dedupedNext.duplicates.length
    }
  };
}

export function computeImportDiff(current: AppState, incoming: AppState): ImportDiffResult {
  const warnings: string[] = [];

  const projects = diffArray(current.projects, incoming.projects, "Projects", warnings);
  const tasks = diffArray(
    current.projects.flatMap((project) => project.tasks),
    incoming.projects.flatMap((project) => project.tasks),
    "Tasks",
    warnings
  );
  const roadmap = diffArray(current.roadmapCards, incoming.roadmapCards, "Roadmap cards", warnings);
  const journal = diffArray(current.journalEntries, incoming.journalEntries, "Journal entries", warnings);
  const weeklyReviews = diffArray(current.weeklyReviews, incoming.weeklyReviews, "Weekly reviews", warnings);
  const weeklySnapshots = diffArray(current.weeklySnapshots, incoming.weeklySnapshots, "Weekly snapshots", warnings);
  const localRepos = diffArray(current.localRepos, incoming.localRepos, "Local repos", warnings);
  const focusSessions = diffArray(current.focusSessions, incoming.focusSessions, "Focus sessions", warnings);

  const all = [projects, tasks, roadmap, journal, weeklyReviews, weeklySnapshots, localRepos, focusSessions];

  return {
    projects,
    tasks,
    roadmap,
    journal,
    weeklyReviews,
    weeklySnapshots,
    localRepos,
    focusSessions,
    summary: {
      additions: all.reduce((sum, item) => sum + item.added, 0),
      changes: all.reduce((sum, item) => sum + item.changed, 0),
      removals: all.reduce((sum, item) => sum + item.removed, 0),
      conflicts: all.reduce((sum, item) => sum + item.conflicts, 0)
    },
    warnings: Array.from(new Set(warnings))
  };
}
