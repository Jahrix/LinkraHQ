import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SCHEMA_VERSION } from "@linkra/shared";
import { getState } from "./store.js";

const BACKUP_DIR = path.join(os.homedir(), ".linkra", "backups");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getBackupDir() {
  return BACKUP_DIR;
}

export function runBackupNow(retentionDays = 14) {
  ensureDir(BACKUP_DIR);
  const filename = `linkra-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const data = {
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    data: getState()
  };
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  pruneBackups(retentionDays);
  return filepath;
}

function pruneBackups(retentionDays: number) {
  ensureDir(BACKUP_DIR);
  const entries = fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => file.startsWith("linkra-backup-"))
    .sort();
  const max = Math.max(retentionDays, 1);
  if (entries.length <= max) return;
  const remove = entries.slice(0, entries.length - max);
  for (const file of remove) {
    fs.unlinkSync(path.join(BACKUP_DIR, file));
  }
}

export function scheduleDailyBackups(retentionDays: number) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    runBackupNow(retentionDays);
    setInterval(() => runBackupNow(retentionDays), 24 * 60 * 60 * 1000);
  }, delay);
}
