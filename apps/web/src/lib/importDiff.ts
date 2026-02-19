import type { AppState } from "@linkra/shared";

export function computeImportDiff(current: AppState, incoming: AppState) {
  const diffArray = <T extends { id: string }>(base: T[], next: T[]) => {
    const baseMap = new Map(base.map((item) => [item.id, item]));
    const nextMap = new Map(next.map((item) => [item.id, item]));
    let added = 0;
    let changed = 0;
    let removed = 0;
    for (const [id, item] of nextMap) {
      if (!baseMap.has(id)) {
        added += 1;
      } else if (JSON.stringify(baseMap.get(id)) !== JSON.stringify(item)) {
        changed += 1;
      }
    }
    for (const id of baseMap.keys()) {
      if (!nextMap.has(id)) removed += 1;
    }
    return { added, changed, removed };
  };

  return {
    projects: diffArray(current.projects, incoming.projects),
    tasks: diffArray(
      current.projects.flatMap((p) => p.tasks),
      incoming.projects.flatMap((p) => p.tasks)
    ),
    roadmap: diffArray(current.roadmapCards, incoming.roadmapCards),
    journal: diffArray(current.journalEntries, incoming.journalEntries)
  };
}
