import type { LocalRepo } from "@linkra/shared";

export type DedupedResult<T> = {
  items: T[];
  duplicates: string[];
};

export function dedupeById<T extends { id: string }>(items: T[]): DedupedResult<T> {
  const map = new Map<string, T>();
  const duplicates: string[] = [];

  for (const item of items) {
    if (map.has(item.id)) {
      duplicates.push(item.id);
      continue;
    }
    map.set(item.id, item);
  }

  return { items: Array.from(map.values()), duplicates };
}

export function dedupeByKey<T>(items: T[], getKey: (item: T) => string): DedupedResult<T> {
  const map = new Map<string, T>();
  const duplicates: string[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (map.has(key)) {
      duplicates.push(key);
      continue;
    }
    map.set(key, item);
  }

  return { items: Array.from(map.values()), duplicates };
}

export function dedupeLocalRepos(repos: LocalRepo[]) {
  const byId = dedupeById(repos);
  const map = new Map<string, LocalRepo>();
  const duplicates = [...byId.duplicates];

  for (const repo of byId.items) {
    const existing = map.get(repo.path);
    if (!existing) {
      map.set(repo.path, repo);
      continue;
    }

    duplicates.push(repo.id);
    const existingTime = existing.scannedAt ? new Date(existing.scannedAt).getTime() : 0;
    const nextTime = repo.scannedAt ? new Date(repo.scannedAt).getTime() : 0;
    if (nextTime >= existingTime) {
      map.set(repo.path, repo);
    }
  }

  return { items: Array.from(map.values()), duplicates };
}
