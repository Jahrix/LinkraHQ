import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { AppState, LocalRepo, Project } from "@linkra/shared";
import { getState, saveState } from "./store.js";

const execFileAsync = promisify(execFile);

type ScanStatus = {
  state: "idle" | "running" | "error";
  running: boolean;
  queued: boolean;
  lastRunAt: string | null;
  durationMs: number | null;
  lastDurationMs: number | null;
  reposScanned: number;
  reposChanged: number;
  errors: string[];
  watcherActive: boolean;
};

type ScanResult = {
  repos: LocalRepo[];
  lastScanAt: string | null;
  nextState?: AppState;
} & ScanStatus;

type PendingScanRequest = {
  full: boolean;
  repoPaths: Set<string>;
};

const WATCH_DEBOUNCE_MS = 1200;
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_LOCAL_COMMITS = 100;

let scanInProgress = false;
let activeScanPromise: Promise<ScanResult> | null = null;
let pendingScanRequest: PendingScanRequest = {
  full: false,
  repoPaths: new Set<string>()
};
let lastScanAt: string | null = null;
let lastScanErrors: string[] = [];
let lastScanDurationMs: number | null = null;
let lastReposScanned = 0;
let lastReposChanged = 0;
let scanState: ScanStatus["state"] = "idle";
let watcher: FSWatcher | null = null;
let watcherActive = false;
let watcherSignature = "";
let schedulerHandle: NodeJS.Timeout | null = null;
const watchDebounceTimers = new Map<string, NodeJS.Timeout>();

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

function repoId(repoPath: string) {
  return crypto.createHash("sha1").update(normalizeRepoPath(repoPath)).digest("hex");
}

function scanTimeValue(scannedAt: string | null) {
  if (!scannedAt) return 0;
  const value = new Date(scannedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function logGitScan(message: string, details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) {
    console.log(`[git-scan] ${message}`);
    return;
  }
  console.log(`[git-scan] ${message}`, details);
}

function canonicalizeLocalRepo(repo: LocalRepo): LocalRepo {
  const normalizedPath = normalizeRepoPath(repo.path);
  return {
    ...repo,
    id: repoId(normalizedPath),
    path: normalizedPath,
    watchDir: repo.watchDir ? normalizeRepoPath(repo.watchDir) : null
  };
}

function dedupeRepos(repos: LocalRepo[]) {
  const byPath = new Map<string, LocalRepo>();
  for (const repo of repos) {
    const normalizedRepo = canonicalizeLocalRepo(repo);
    const existing = byPath.get(normalizedRepo.path);
    if (!existing || scanTimeValue(normalizedRepo.scannedAt) >= scanTimeValue(existing.scannedAt)) {
      byPath.set(normalizedRepo.path, normalizedRepo);
    }
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function countChangedRepos(previousMap: Map<string, LocalRepo>, nextRepos: LocalRepo[]) {
  let changed = 0;
  const seen = new Set<string>();

  for (const repo of nextRepos) {
    const normalizedPath = normalizeRepoPath(repo.path);
    seen.add(normalizedPath);
    const previous = previousMap.get(normalizedPath);
    if (!previous) {
      changed += 1;
      continue;
    }

    if (
      previous.lastHeadSha !== repo.lastHeadSha ||
      previous.lastStatusHash !== repo.lastStatusHash ||
      previous.scanError !== repo.scanError
    ) {
      changed += 1;
    }
  }

  for (const previousPath of previousMap.keys()) {
    if (!seen.has(previousPath)) {
      changed += 1;
    }
  }

  return changed;
}

function hasPendingScanRequest() {
  return pendingScanRequest.full || pendingScanRequest.repoPaths.size > 0;
}

function enqueueScanRequest(repoPath?: string | null) {
  if (!repoPath) {
    pendingScanRequest.full = true;
    pendingScanRequest.repoPaths.clear();
    logGitScan("queued full scan");
    return;
  }

  const normalizedRepoPath = normalizeRepoPath(repoPath);
  if (pendingScanRequest.full) {
    return;
  }

  pendingScanRequest.repoPaths.add(normalizedRepoPath);
  logGitScan("queued repo scan", { repoPath: normalizedRepoPath });
}

function consumePendingScanRequest() {
  if (pendingScanRequest.full) {
    pendingScanRequest = { full: false, repoPaths: new Set<string>() };
    return { full: true, repoPath: undefined as string | undefined };
  }

  if (pendingScanRequest.repoPaths.size === 0) {
    return null;
  }

  if (pendingScanRequest.repoPaths.size === 1) {
    const [repoPath] = pendingScanRequest.repoPaths;
    pendingScanRequest = { full: false, repoPaths: new Set<string>() };
    return { full: false, repoPath };
  }

  pendingScanRequest = { full: false, repoPaths: new Set<string>() };
  return { full: true, repoPath: undefined as string | undefined };
}

function buildScanResult(repos: LocalRepo[], nextState?: AppState): ScanResult {
  const result: ScanResult = {
    repos,
    lastScanAt,
    ...getScanStatus()
  };
  if (nextState) {
    result.nextState = nextState;
  }
  return result;
}

function compileExcludeTokens(patterns: string[]) {
  return patterns
    .map((pattern) => pattern.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\/+/g, "/").trim())
    .filter(Boolean)
    .map((pattern) => pattern.replace(/^\.?\//, "").replace(/\/$/, "").toLowerCase());
}

function normalizeComparablePath(targetPath: string) {
  return targetPath.split(path.sep).join("/").toLowerCase();
}

function isExcluded(targetPath: string, tokens: string[]) {
  const normalized = normalizeComparablePath(path.resolve(targetPath));
  return tokens.some((token) => token && normalized.includes(token));
}

function normalizeWatchDirs(watchDirs: string[]) {
  return dedupeStrings(
    watchDirs
      .filter(Boolean)
      .filter((dir) => fs.existsSync(dir))
      .map((dir) => normalizeRepoPath(dir))
  );
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function findOwningWatchDir(repoPath: string, watchDirs: string[]) {
  const normalizedRepoPath = normalizeRepoPath(repoPath);
  const matches = watchDirs
    .filter((dir) => normalizedRepoPath === dir || normalizedRepoPath.startsWith(`${dir}${path.sep}`))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

export function isPathWithinWatchDirs(repoPath: string, watchDirs: string[]) {
  if (!watchDirs.length) return false;
  const normalized = normalizeRepoPath(repoPath);
  return watchDirs.some((dir) => {
    const normalizedDir = normalizeRepoPath(dir);
    return normalized === normalizedDir || normalized.startsWith(`${normalizedDir}${path.sep}`);
  });
}

function assertRepoPathAllowed(repoPath: string, watchDirs = getState().userSettings.repoWatchDirs) {
  if (!isPathWithinWatchDirs(repoPath, watchDirs)) {
    throw new Error("repo path must be inside configured watch directories");
  }
}

function hasGitMetadata(repoPath: string) {
  return fs.existsSync(path.join(repoPath, ".git"));
}

export function getScanStatus() {
  return {
    state: scanState,
    running: scanInProgress,
    queued: hasPendingScanRequest(),
    lastRunAt: lastScanAt,
    durationMs: lastScanDurationMs,
    lastDurationMs: lastScanDurationMs,
    reposScanned: lastReposScanned,
    reposChanged: lastReposChanged,
    errors: lastScanErrors,
    watcherActive
  } satisfies ScanStatus;
}

export function getGitHealth(state = getState()) {
  const repos = dedupeRepos(state.localRepos);
  const watchDirs = normalizeWatchDirs(state.userSettings.repoWatchDirs);
  return {
    repos: repos.length,
    localRepos: repos,
    dirty: repos.filter((repo) => repo.dirty).length,
    errors: repos.filter((repo) => repo.scanError).length,
    watchDirs: watchDirs.length,
    watchDirPaths: watchDirs,
    missingWatchDirs: state.userSettings.repoWatchDirs.filter((dir) => !fs.existsSync(dir)),
    scan: getScanStatus()
  };
}

export async function runGitScanNow(state = getState(), repoPath?: string) {
  const normalizedWatchDirs = normalizeWatchDirs(state.userSettings.repoWatchDirs);
  const targetRepoPath = repoPath ? normalizeRepoPath(repoPath) : undefined;

  if (targetRepoPath) {
    assertRepoPathAllowed(targetRepoPath, normalizedWatchDirs);
    if (!hasGitMetadata(targetRepoPath)) {
      throw new Error("repo path is not a git repository");
    }
  }

  if (activeScanPromise) {
    enqueueScanRequest(targetRepoPath);
    return buildScanResult(dedupeRepos(state.localRepos), state);
  }

  activeScanPromise = executeGitScan(state, targetRepoPath, normalizedWatchDirs)
    .then(async (result) => {
      if (result.nextState) {
        // Merge only the scan outputs (localRepos + project health scores) into the
        // CURRENT store state, not the snapshot captured at scan start. This prevents
        // a long-running scan from overwriting settings changes made during the scan.
        const current = getState();
        await saveState({
          ...current,
          localRepos: result.nextState.localRepos,
          projects: result.nextState.projects
        });
      }
      return result;
    })
    .finally(() => {
      activeScanPromise = null;
      const pending = consumePendingScanRequest();
      if (pending) {
        void runGitScanNow(getState(), pending.repoPath).catch((error) => {
          const message = error instanceof Error ? error.message : "Queued git scan failed";
          lastScanErrors = [message];
          scanState = "error";
          logGitScan("queued scan failed", { error: message });
        });
      }
    });

  return activeScanPromise;
}

async function executeGitScan(
  state: AppState,
  targetRepoPath: string | undefined,
  normalizedWatchDirs: string[]
) {
  const start = Date.now();
  scanInProgress = true;
  scanState = "running";
  const scope = targetRepoPath ? "repo" : "full";
  logGitScan("starting scan", {
    scope,
    repoPath: targetRepoPath ?? null,
    watchDirs: normalizedWatchDirs.length
  });

  try {
    const existingRepos = dedupeRepos(state.localRepos);
    const excludeTokens = compileExcludeTokens(state.userSettings.repoExcludePatterns);
    const repoTargets = targetRepoPath
      ? [
          {
            path: targetRepoPath,
            watchDir: findOwningWatchDir(targetRepoPath, normalizedWatchDirs)
          }
        ]
      : await discoverRepos(normalizedWatchDirs, excludeTokens);

    const previousMap = new Map(existingRepos.map((repo) => [normalizeRepoPath(repo.path), repo]));
    const repos: LocalRepo[] = targetRepoPath ? [...existingRepos] : [];

    for (const target of repoTargets) {
      const repo = await scanRepo(target.path, previousMap.get(target.path), target.watchDir);
      if (targetRepoPath) {
        const index = repos.findIndex((item) => normalizeRepoPath(item.path) === target.path);
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
    const changedRepos = countChangedRepos(previousMap, uniqueRepos);
    const durationMs = Date.now() - start;

    lastScanAt = new Date().toISOString();
    lastScanDurationMs = durationMs;
    lastReposScanned = repoTargets.length;
    lastReposChanged = changedRepos;
    lastScanErrors = uniqueRepos
      .map((repo) => repo.scanError)
      .filter((error): error is string => Boolean(error));
    scanState = lastScanErrors.length > 0 ? "error" : "idle";

    const next: AppState = {
      ...state,
      localRepos: uniqueRepos,
      projects: state.projects.map((project) => applyHealthScore(project, uniqueRepos))
    };

    scanInProgress = false;
    logGitScan("completed scan", {
      scope,
      repoPath: targetRepoPath ?? null,
      reposScanned: repoTargets.length,
      reposChanged: changedRepos,
      durationMs,
      errors: lastScanErrors.length
    });

    return buildScanResult(uniqueRepos, next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git scan failed";
    lastScanErrors = [message];
    lastScanDurationMs = Date.now() - start;
    lastReposScanned = 0;
    lastReposChanged = 0;
    scanState = "error";
    scanInProgress = false;
    logGitScan("scan failed", {
      scope,
      repoPath: targetRepoPath ?? null,
      error: message
    });
    return buildScanResult(dedupeRepos(state.localRepos), state);
  }
}

export function startGitScanScheduler() {
  if (schedulerHandle) return;

  schedulerHandle = setInterval(async () => {
    const state = getState();
    const intervalMinutes = state.userSettings.repoScanIntervalMinutes || 15;
    const lastScan = lastScanAt ? new Date(lastScanAt).getTime() : 0;
    const shouldRun = !lastScanAt || Date.now() - lastScan >= intervalMinutes * 60 * 1000;
    if (!shouldRun) return;
    await runGitScanNow();
  }, 60 * 1000);
}

export function startGitWatcher() {
  const state = getState();
  if (!state.userSettings.gitWatcherEnabled) {
    stopGitWatcher();
    return;
  }

  const watchDirs = normalizeWatchDirs(state.userSettings.repoWatchDirs);
  if (watchDirs.length === 0) {
    stopGitWatcher();
    return;
  }

  const excludeTokens = compileExcludeTokens(state.userSettings.repoExcludePatterns);
  const signature = JSON.stringify({ watchDirs, excludeTokens });
  if (watcher && watcherSignature === signature) {
    watcherActive = true;
    return;
  }

  stopGitWatcher();

  watcher = chokidar.watch(watchDirs, {
    ignored: (target) => isExcluded(target, excludeTokens),
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 100
    },
    depth: 10
  });

  watcherSignature = signature;
  watcherActive = true;
  logGitScan("watcher started", { watchDirs: watchDirs.length });

  watcher.on("all", (event: string, filepath: string) => {
    if (isExcluded(filepath, excludeTokens)) {
      return;
    }

    const repoRoot = resolveWatchEventRepoRoot(event, filepath, watchDirs);
    if (repoRoot) {
      scheduleWatchScan(repoRoot);
      return;
    }

    if ((event === "addDir" || event === "unlinkDir") && path.basename(filepath) === ".git") {
      scheduleWatchScan(undefined);
    }
  });

  watcher.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    lastScanErrors = [...lastScanErrors, `Watcher error: ${message}`].slice(-20);
    scanState = "error";
    logGitScan("watcher error", { error: message });
    stopGitWatcher();
  });
}

function scheduleWatchScan(repoPath?: string) {
  if (!repoPath) {
    enqueueWatchDebounce("__full_scan__", () => {
      if (scanInProgress) {
        enqueueScanRequest();
        return;
      }
      void runGitScanNow();
    });
    return;
  }

  const normalizedRepoPath = normalizeRepoPath(repoPath);
  enqueueWatchDebounce(normalizedRepoPath, () => {
    if (scanInProgress) {
      enqueueScanRequest(normalizedRepoPath);
      return;
    }
    void runGitScanNow(getState(), normalizedRepoPath).catch((error) => {
      const message = error instanceof Error ? error.message : "Watcher git scan failed";
      lastScanErrors = [message];
      scanState = "error";
      logGitScan("watcher repo scan failed", {
        repoPath: normalizedRepoPath,
        error: message
      });
    });
  });
}

function enqueueWatchDebounce(key: string, callback: () => void) {
  const existingTimer = watchDebounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    watchDebounceTimers.delete(key);
    callback();
  }, WATCH_DEBOUNCE_MS);

  watchDebounceTimers.set(key, timer);
}

export function stopGitWatcher() {
  for (const timer of watchDebounceTimers.values()) {
    clearTimeout(timer);
  }
  watchDebounceTimers.clear();

  if (watcher) {
    watcher.close().catch(() => null);
  }

  watcher = null;
  watcherActive = false;
  watcherSignature = "";
}

export async function fetchLocalCommits(
  repoPath: string,
  limit: number,
  since?: string,
  watchDirs?: string[]
) {
  const normalizedPath = normalizeRepoPath(repoPath);
  assertRepoPathAllowed(normalizedPath, watchDirs);
  if (!hasGitMetadata(normalizedPath)) {
    throw new Error("repo path is not a git repository");
  }

  const stdout = await runGit(normalizedPath, buildCommitLogArgs(limit, since));
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

function buildCommitLogArgs(limit: number, since?: string) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_LOCAL_COMMITS);
  const args = ["log", `-${safeLimit}`, "--pretty=%H|%an|%ad|%s", "--date=iso-strict"];
  const normalizedSince = normalizeSinceValue(since);
  if (normalizedSince) {
    args.splice(2, 0, `--since=${normalizedSince}`);
  }
  return args;
}

function normalizeSinceValue(since?: string) {
  if (!since) return null;
  const trimmed = since.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error("since must be a valid date");
  }
  return new Date(parsed).toISOString();
}

function applyHealthScore(project: Project, repos: LocalRepo[]): Project {
  if (!project.localRepoPath) {
    return { ...project, healthScore: null };
  }

  const normalizedProjectRepoPath = normalizeRepoPath(project.localRepoPath);
  const repo = repos.find((item) => item.path === normalizedProjectRepoPath);
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

async function discoverRepos(roots: string[], excludeTokens: string[]) {
  const repos: Array<{ path: string; watchDir: string | null }> = [];
  const queue = [...roots];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (!fs.existsSync(current) || isExcluded(current, excludeTokens)) {
      continue;
    }

    const normalizedCurrent = normalizeRepoPath(current);
    if (visited.has(normalizedCurrent)) {
      continue;
    }
    visited.add(normalizedCurrent);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(normalizedCurrent, { withFileTypes: true });
    } catch {
      continue;
    }

    if (entries.some((entry) => entry.name === ".git")) {
      repos.push({
        path: normalizedCurrent,
        watchDir: findOwningWatchDir(normalizedCurrent, roots)
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nextPath = path.join(normalizedCurrent, entry.name);
      if (isExcluded(nextPath, excludeTokens)) continue;
      queue.push(nextPath);
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
    if (!hasGitMetadata(normalizedRepoPath)) {
      throw new Error("Missing .git metadata");
    }

    const headSha = await runGitSafe(normalizedRepoPath, ["rev-parse", "HEAD"]);
    const statusRaw = await runGit(normalizedRepoPath, ["status", "--porcelain", "--untracked-files=all"]);
    const statusHash = crypto.createHash("sha1").update(statusRaw).digest("hex");

    if (previous && previous.lastHeadSha === headSha && previous.lastStatusHash === statusHash) {
      return {
        ...canonicalizeLocalRepo(previous),
        watchDir: watchDir ? normalizeRepoPath(watchDir) : previous.watchDir ?? null,
        scannedAt,
        lastScanDurationMs: Date.now() - start,
        scanError: null
      };
    }

    const dirty = statusRaw.trim().length > 0;
    const untrackedCount = statusRaw
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
  } catch (error) {
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
      scanError: error instanceof Error ? error.message : "Scan failed",
      scannedAt
    };
  }
}

function resolveWatchEventRepoRoot(event: string, filepath: string, watchDirs: string[]) {
  const candidate = path.resolve(filepath);

  if ((event === "addDir" || event === "unlinkDir") && path.basename(candidate) === ".git") {
    const repoRoot = path.dirname(candidate);
    if (isPathWithinWatchDirs(repoRoot, watchDirs)) {
      return normalizeRepoPath(repoRoot);
    }
    return null;
  }

  const repoRoot = findRepoRoot(candidate);
  if (!repoRoot) {
    return null;
  }

  if (!isPathWithinWatchDirs(repoRoot, watchDirs)) {
    return null;
  }

  return normalizeRepoPath(repoRoot);
}

function findRepoRoot(filePath: string) {
  let current = path.dirname(path.resolve(filePath));
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      current = normalizeRepoPath(filePath);
    }
  } catch {
    current = path.dirname(path.resolve(filePath));
  }

  for (let depth = 0; depth < 12; depth += 1) {
    if (hasGitMetadata(current)) {
      return normalizeRepoPath(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

async function runGit(repoPath: string, args: string[]) {
  const { stdout } = await execFileAsync(
    "git",
    [
      "--no-optional-locks",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "gc.auto=0",
      "-C",
      repoPath,
      ...args
    ],
    {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        HUSKY: "0"
      }
    }
  );

  return stdout.trim();
}

async function runGitSafe(repoPath: string, args: string[]) {
  try {
    return await runGit(repoPath, args);
  } catch {
    return "";
  }
}

export const __test__ = {
  buildCommitLogArgs,
  dedupeRepos,
  isPathWithinWatchDirs,
  normalizeSinceValue,
  repoId,
  setScanInProgress(value: boolean) {
    scanInProgress = value;
    activeScanPromise = value ? Promise.resolve(buildScanResult(dedupeRepos(getState().localRepos))) : null;
    scanState = value ? "running" : "idle";
  },
  resetScanStatus() {
    scanInProgress = false;
    activeScanPromise = null;
    pendingScanRequest = { full: false, repoPaths: new Set<string>() };
    scanState = "idle";
    lastScanAt = null;
    lastScanErrors = [];
    lastScanDurationMs = null;
    lastReposScanned = 0;
    lastReposChanged = 0;
  }
};
