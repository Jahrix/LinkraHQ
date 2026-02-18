import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppState, LocalRepo, Project } from "@linkra/shared";
import { getState, saveState } from "./store.js";

const execFileAsync = promisify(execFile);

let scanInProgress = false;
let lastScanAt: string | null = null;
let lastScanErrors: string[] = [];

export function getScanStatus() {
  return {
    lastScanAt,
    errors: lastScanErrors,
    running: scanInProgress
  };
}

export async function runGitScanNow() {
  if (scanInProgress) {
    return { repos: getState().localRepos, ...getScanStatus() };
  }

  scanInProgress = true;
  const state = getState();
  const excludeTokens = compileExcludeTokens(state.userSettings.repoExcludePatterns);
  const repoPaths = await discoverRepos(state.userSettings.repoWatchDirs, excludeTokens);

  const repos: LocalRepo[] = [];
  for (const repoPath of repoPaths) {
    const repo = await scanRepo(repoPath);
    repos.push(repo);
  }

  const now = new Date().toISOString();
  lastScanAt = now;
  lastScanErrors = repos.filter((repo) => repo.scanError).map((repo) => repo.scanError as string);

  const next: AppState = {
    ...state,
    localRepos: repos,
    projects: state.projects.map((project) => applyHealthScore(project, repos))
  };

  await saveState(next);
  scanInProgress = false;
  return { repos, lastScanAt, errors: lastScanErrors };
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

export async function fetchLocalCommits(repoPath: string, limit: number) {
  const stdout = await runGit(repoPath, [
    "log",
    `-${limit}`,
    "--pretty=%H|%an|%ad|%s",
    "--date=iso-strict"
  ]);

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
  const repos = new Set<string>();
  const queue = roots.filter((root) => root && fs.existsSync(root));

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
      repos.add(current);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      queue.push(path.join(current, entry.name));
    }
  }

  return Array.from(repos);
}

async function scanRepo(repoPath: string): Promise<LocalRepo> {
  const name = path.basename(repoPath);
  const scannedAt = new Date().toISOString();

  try {
    const status = await runGit(repoPath, ["status", "--porcelain"]);
    const dirty = status.trim().length > 0;
    const untrackedCount = status
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .length;

    const branch = await runGitSafe(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    const defaultBranch = branch ? branch.split("/").pop() ?? null : await runGitSafe(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    const remoteUrl = await runGitSafe(repoPath, ["remote", "get-url", "origin"]);

    const lastCommitRaw = await runGitSafe(repoPath, [
      "log",
      "-1",
      "--pretty=%H|%an|%ad|%s",
      "--date=iso-strict"
    ]);
    const [sha, author, date, ...messageParts] = (lastCommitRaw || "").split("|");
    const lastCommitMessage = messageParts.join("|") || null;

    const aheadBehind = await runGitSafe(repoPath, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    const [aheadRaw, behindRaw] = aheadBehind ? aheadBehind.split(/\s+/) : ["0", "0"];

    const todayLog = await runGitSafe(repoPath, ["log", "--since=midnight", "--pretty=oneline"]);
    const todayCommitCount = todayLog ? todayLog.split("\n").filter(Boolean).length : 0;

    return {
      id: repoId(repoPath),
      name,
      path: repoPath,
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
      scanError: null,
      scannedAt
    };
  } catch (err) {
    return {
      id: repoId(repoPath),
      name,
      path: repoPath,
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
      scanError: err instanceof Error ? err.message : "Scan failed",
      scannedAt
    };
  }
}

function repoId(repoPath: string) {
  return crypto.createHash("sha1").update(repoPath).digest("hex");
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
