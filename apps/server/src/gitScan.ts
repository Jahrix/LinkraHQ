import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { AppState, LocalRepo, Project } from "@linkra/shared";
import { getState, saveState } from "./store.js";

const execFileAsync = promisify(execFile);

let scanInProgress = false;
let lastScanAt: string | null = null;
let lastScanErrors: string[] = [];
let watcher: FSWatcher | null = null;
let watcherActive = false;

function normalizeRepoPath(repoPath: string) {
  try {
    return fs.realpathSync.native(repoPath);
  } catch {
    return path.resolve(repoPath);
  }
}

function scanTimeValue(scannedAt: string | null) {
  if (!scannedAt) return 0;
  const t = new Date(scannedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function dedupeRepos(repos: LocalRepo[]) {
  const map = new Map<string, LocalRepo>();
  for (const repo of repos) {
    const normalizedPath = normalizeRepoPath(repo.path);
    const dedupeKey = `${repo.id}:${normalizedPath}`;
    const normalizedRepo: LocalRepo = {
      ...repo,
      id: repo.id || repoId(normalizedPath),
      path: normalizedPath
    };
    const existing = map.get(dedupeKey);
    if (!existing || scanTimeValue(normalizedRepo.scannedAt) >= scanTimeValue(existing.scannedAt)) {
      map.set(dedupeKey, normalizedRepo);
    }
  }

  const byPath = new Map<string, LocalRepo>();
  for (const repo of map.values()) {
    const existing = byPath.get(repo.path);
    if (!existing || scanTimeValue(repo.scannedAt) >= scanTimeValue(existing.scannedAt)) {
      byPath.set(repo.path, repo);
    }
  }
  return Array.from(byPath.values());
}

export function getScanStatus() {
  return {
    lastScanAt,
    errors: lastScanErrors,
    running: scanInProgress,
    watcherActive
  };
}

export function getGitHealth() {
  const state = getState();
  const repos = state.localRepos;
  const lastScan = lastScanAt;
  return {
    repos: repos.length,
    dirty: repos.filter((repo) => repo.dirty).length,
    errors: repos.filter((repo) => repo.scanError).length,
    lastScanAt: lastScan,
    watcherActive
  };
}

export async function runGitScanNow(repoPath?: string) {
  if (scanInProgress) {
    return { repos: getState().localRepos, ...getScanStatus() };
  }

  scanInProgress = true;
  const state = getState();
  const existingRepos = dedupeRepos(state.localRepos);
  const excludeTokens = compileExcludeTokens(state.userSettings.repoExcludePatterns);
  const targetRepoPath = repoPath ? normalizeRepoPath(repoPath) : undefined;
  const repoTargets = repoPath
    ? [
        {
          path: targetRepoPath as string,
          watchDir:
            state.userSettings.repoWatchDirs.find((dir) => (targetRepoPath as string).startsWith(dir)) ?? null
        }
      ]
    : await discoverRepos(state.userSettings.repoWatchDirs, excludeTokens);

  const previousMap = new Map(existingRepos.map((repo) => [normalizeRepoPath(repo.path), repo]));
  const repos: LocalRepo[] = repoPath ? [...existingRepos] : [];
  for (const target of repoTargets) {
    const nextPath = normalizeRepoPath(target.path);
    const repo = await scanRepo(nextPath, previousMap.get(nextPath), target.watchDir);
    if (repoPath) {
      const index = repos.findIndex((item) => item.path === nextPath);
      if (index >= 0) {
        repos[index] = repo;
      } else {
        repos.push(repo);
      }
    } else {
      repos.push(repo);
    }
  }
  const uniqueRepos = dedupeRepos(repos);

  const now = new Date().toISOString();
  lastScanAt = now;
  lastScanErrors = uniqueRepos
    .filter((repo) => repo.scanError)
    .map((repo) => repo.scanError as string);

  const next: AppState = {
    ...state,
    localRepos: uniqueRepos,
    projects: state.projects.map((project) => applyHealthScore(project, uniqueRepos))
  };

  await saveState(next);
  scanInProgress = false;
  return { repos: uniqueRepos, lastScanAt, errors: lastScanErrors };
}

export function startGitScanScheduler() {
  setInterval(async () => {
    const state = getState();
    const intervalMinutes = state.userSettings.repoScanIntervalMinutes || 15;
    const lastScan = lastScanAt ? new Date(lastScanAt).getTime() : 0;
    const shouldRun = !lastScanAt || Date.now() - lastScan >= intervalMinutes * 60 * 1000;
    if (!shouldRun || scanInProgress) return;
    await runGitScanNow();
  }, 60 * 1000);
}

export function startGitWatcher() {
  const state = getState();
  if (!state.userSettings.gitWatcherEnabled) return;
  if (watcher) return;

  const excludeTokens = compileExcludeTokens(state.userSettings.repoExcludePatterns);
  const watchDirs = state.userSettings.repoWatchDirs
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => normalizeRepoPath(dir));

  const repoGitDirs = dedupeRepos(state.localRepos)
    .map((repo) => path.join(repo.path, ".git"))
    .filter((gitDir) => fs.existsSync(gitDir));

  // Prefer watching discovered repos only; fallback to watch roots if repo list is empty.
  const watchTargets = repoGitDirs.length > 0 ? repoGitDirs : watchDirs;
  if (watchTargets.length === 0) return;

  watcher = chokidar.watch(watchTargets, {
    ignored: (target) => isExcluded(target, excludeTokens),
    ignoreInitial: true,
    persistent: true,
    depth: 8
  });

  watcherActive = true;

  watcher.on("all", async (_event: string, filepath: string) => {
    if (scanInProgress) return;
    const repoRoot = findRepoRoot(filepath);
    if (repoRoot) {
      await runGitScanNow(normalizeRepoPath(repoRoot));
    }
  });

  watcher.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    lastScanErrors = [...lastScanErrors, `Watcher error: ${message}`].slice(-20);
    stopGitWatcher();
  });
}

export function stopGitWatcher() {
  if (watcher) {
    watcher.close().catch(() => null);
  }
  watcher = null;
  watcherActive = false;
}

export async function fetchLocalCommits(repoPath: string, limit: number, since?: string) {
  const args = ["log", `-${limit}`, "--pretty=%H|%an|%ad|%s", "--date=iso-strict"];
  if (since) {
    args.splice(2, 0, `--since=${since}`);
  }
  const stdout = await runGit(repoPath, args);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, author, date, ...messageParts] = line.split("|");
      return {
        sha,
        shortSha: sha.slice(0, 7),
        message: messageParts.join("|"),
        author,
        date,
        url: ""
      };
    });
}

function applyHealthScore(project: Project, repos: LocalRepo[]): Project {
  if (!project.localRepoPath) {
    return { ...project, healthScore: null };
  }
  const repo = repos.find((item) => item.path === project.localRepoPath);
  if (!repo || repo.scanError) {
    return { ...project, healthScore: null };
  }

  const activityScore = Math.min(repo.todayCommitCount * 20, 100);
  const ageScore = computeRecencyScore(repo.lastCommitAt);
  const tasksScore = project.tasks.length
    ? Math.round((project.tasks.filter((task) => task.done).length / project.tasks.length) * 100)
    : 0;
  const timeScore = 0;

  const score = Math.round(
    activityScore * 0.4 + ageScore * 0.3 + tasksScore * 0.2 + timeScore * 0.1
  );
  return { ...project, healthScore: score };
}

function computeRecencyScore(lastCommitAt: string | null) {
  if (!lastCommitAt) return 0;
  const diffDays = (Date.now() - new Date(lastCommitAt).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return 100;
  if (diffDays <= 3) return 70;
  if (diffDays <= 7) return 40;
  return 10;
}

function compileExcludeTokens(patterns: string[]) {
  return patterns
    .map((pattern) => pattern.replace(/\*/g, "").replace(/\/+/g, "/").trim())
    .filter(Boolean)
    .map((pattern) => pattern.replace(/\//g, ""));
}

function isExcluded(targetPath: string, tokens: string[]) {
  return tokens.some((token) => token && targetPath.includes(token));
}

async function discoverRepos(roots: string[], excludeTokens: string[]) {
  const repos: Array<{ path: string; watchDir: string }> = [];
  const normalizedRoots = roots
    .filter((root) => root && fs.existsSync(root))
    .map((root) => normalizeRepoPath(root));
  const queue = [...normalizedRoots];

  while (queue.length) {
    const current = queue.pop() as string;
    if (!fs.existsSync(current)) continue;
    if (isExcluded(current, excludeTokens)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    const gitEntry = entries.find((entry) => entry.name === ".git");
    if (gitEntry) {
      const watchDir = normalizedRoots.find((root) => current.startsWith(root)) ?? current;
      repos.push({ path: normalizeRepoPath(current), watchDir: normalizeRepoPath(watchDir) });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      queue.push(path.join(current, entry.name));
    }
  }

  return repos;
}

async function scanRepo(repoPath: string, previous?: LocalRepo, watchDir?: string | null): Promise<LocalRepo> {
  const normalizedRepoPath = normalizeRepoPath(repoPath);
  const name = path.basename(normalizedRepoPath);
  const scannedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const headSha = await runGitSafe(normalizedRepoPath, ["rev-parse", "HEAD"]);
    const statusRaw = await runGit(normalizedRepoPath, ["status", "--porcelain"]);
    const statusHash = crypto.createHash("sha1").update(statusRaw).digest("hex");

    if (previous && previous.lastHeadSha === headSha && previous.lastStatusHash === statusHash) {
      return {
        ...previous,
        watchDir: watchDir ?? previous.watchDir ?? null,
        scannedAt,
        lastScanDurationMs: Date.now() - start
      };
    }

    const status = await runGit(normalizedRepoPath, ["status", "--porcelain"]);
    const dirty = status.trim().length > 0;
    const untrackedCount = status
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .length;

    const branch = await runGitSafe(normalizedRepoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    const defaultBranch = branch
      ? branch.split("/").pop() ?? null
      : await runGitSafe(normalizedRepoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    const remoteUrl = await runGitSafe(normalizedRepoPath, ["remote", "get-url", "origin"]);

    const lastCommitRaw = await runGitSafe(normalizedRepoPath, [
      "log",
      "-1",
      "--pretty=%H|%an|%ad|%s",
      "--date=iso-strict"
    ]);
    const [sha, author, date, ...messageParts] = (lastCommitRaw || "").split("|");
    const lastCommitMessage = messageParts.join("|") || null;

    const aheadBehind = await runGitSafe(normalizedRepoPath, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{u}"
    ]);
    const [aheadRaw, behindRaw] = aheadBehind ? aheadBehind.split(/\s+/) : ["0", "0"];

    const todayLog = await runGitSafe(normalizedRepoPath, ["log", "--since=midnight", "--pretty=oneline"]);
    const todayCommitCount = todayLog ? todayLog.split("\n").filter(Boolean).length : 0;

    return {
      id: repoId(normalizedRepoPath),
      name,
      path: normalizedRepoPath,
      watchDir: watchDir ? normalizeRepoPath(watchDir) : previous?.watchDir ?? null,
      remoteUrl: remoteUrl || null,
      defaultBranch: defaultBranch || null,
      lastCommitAt: date || null,
      lastCommitMessage: lastCommitMessage || null,
      lastCommitAuthor: author || null,
      dirty,
      untrackedCount,
      ahead: Number(aheadRaw) || 0,
      behind: Number(behindRaw) || 0,
      todayCommitCount,
      lastHeadSha: headSha || null,
      lastStatusHash: statusHash,
      lastScanDurationMs: Date.now() - start,
      scanError: null,
      scannedAt
    };
  } catch (err) {
    return {
      id: repoId(normalizedRepoPath),
      name,
      path: normalizedRepoPath,
      watchDir: watchDir ? normalizeRepoPath(watchDir) : previous?.watchDir ?? null,
      remoteUrl: null,
      defaultBranch: null,
      lastCommitAt: null,
      lastCommitMessage: null,
      lastCommitAuthor: null,
      dirty: false,
      untrackedCount: 0,
      ahead: 0,
      behind: 0,
      todayCommitCount: 0,
      lastHeadSha: null,
      lastStatusHash: null,
      lastScanDurationMs: Date.now() - start,
      scanError: err instanceof Error ? err.message : "Scan failed",
      scannedAt
    };
  }
}

function repoId(repoPath: string) {
  return crypto.createHash("sha1").update(repoPath).digest("hex");
}

function findRepoRoot(filePath: string) {
  let current = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? normalizeRepoPath(filePath)
    : path.dirname(filePath);
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return normalizeRepoPath(current);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function runGit(repoPath: string, args: string[]) {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    timeout: 10000
  });
  return stdout.trim();
}

async function runGitSafe(repoPath: string, args: string[]) {
  try {
    return await runGit(repoPath, args);
  } catch {
    return "";
  }
}
