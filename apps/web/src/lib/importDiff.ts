import type { AppState } from "@linkra/shared";
import { dedupeById } from "./collections";

export type ImportEntityDiff = {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  /** Items that exist in both local and import with different content.
   *  In a merge_keep operation these would be overwritten by the import
   *  unless local is kept. Renamed from `conflicts` to reflect actual semantics. */
  overwrites: number;
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
    overwrites: number;
  };
  warnings: string[];
};

/** Structural deep equality — avoids JSON.stringify which is order-dependent
 *  and has poor performance characteristics on large nested objects. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => deepEqual(item, (b as unknown[])[idx]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(bObj, key) && deepEqual(aObj[key], bObj[key])
  );
}

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

    if (deepEqual(baseMap.get(id), item)) {
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
    overwrites: changed,
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
      overwrites: all.reduce((sum, item) => sum + item.overwrites, 0)
    },
    warnings: Array.from(new Set(warnings))
  };
}
