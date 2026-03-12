import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  AppStateSchema,
  createBuildPlanPrompt,
  generateWeeklyReview,
  parseBuildPlanResponse,
  type AppState
} from "@linkra/shared";
import {
  fetchGithubCommits,
  fetchGithubUser,
  findMatchingCommit,
} from "./github.js";
import { createStartupAssets, detectOS, startupInstructions, getStartupDir } from "./startup.js";
import { getGitHealth, getScanStatus, runGitScanNow, fetchLocalCommits, startGitScanScheduler, startGitWatcher } from "./gitScan.js";
import { loadStore } from "./store.js";
import { updateInsights, runInsightAction } from "./insights.js";
import { runBackupNow, getBackupDir } from "./backup.js";
import {
  consumeAiPlanQuota,
  fetchAiPlanQuotaStatus,
  checkAgentQuota,
  getAgentQuotaStatus,
  readSupabaseAppState,
  writeSupabaseAppState,
  getUserIdFromToken,
  createAgentConversation,
  updateConversationTitle,
  touchConversation,
  insertAgentMessages,
  listAgentConversations,
  getAgentConversationMessages,
  verifyConversationOwner,
  deleteAgentConversation
} from "./supabaseQuota.js";
import os from "node:os";

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);
dotenv.config({ path: path.resolve(__dirname_local, "../.env") });

console.log('Starting Linkra server...');
console.log('PORT:', process.env.PORT);
console.log('SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 4170);

function getPersistentSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  
  const secretPath = path.join(os.homedir(), ".linkra-secret");
  try {
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, "utf-8").trim();
    }
  } catch (err) {
    console.error("Failed to read persistent secret:", err);
  }

  const newSecret = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
  } catch (err) {
    console.error("Failed to write persistent secret:", err);
  }
  return newSecret;
}

const SESSION_SECRET = getPersistentSecret();

const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";
const SESSION_COOKIE_NAME = "connect.sid";

const execFileAsync = promisify(execFile);

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function normalizeOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (!isLoopbackHostname(parsed.hostname)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function buildAllowedClientOrigins() {
  const origins = new Set<string>();
  const candidates = [
    DEFAULT_CLIENT_ORIGIN,
    "http://127.0.0.1:5173",
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    process.env.CLIENT_ORIGIN,
    process.env.LOCAL_CLIENT_ORIGIN
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

const allowedClientOrigins = buildAllowedClientOrigins();

function isLoopbackAddress(address?: string | null) {
  if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.SUPABASE_URL) {
    return true;
  }
  if (!address) {
    return false;
  }
  return (
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === "::ffff:127.0.1.1" ||
    address.startsWith("127.")
  );
}

function getRequestOrigin(req: express.Request) {
  const originHeader = req.get("origin");
  const refererHeader = req.get("referer");
  if (originHeader) {
    return normalizeOrigin(originHeader);
  }
  if (!refererHeader) {
    return null;
  }
  try {
    const parsed = new URL(refererHeader);
    return normalizeOrigin(parsed.origin);
  } catch {
    return null;
  }
}

function requestHasUntrustedOrigin(req: express.Request) {
  const originHeader = req.get("origin");
  const refererHeader = req.get("referer");
  if (!originHeader && !refererHeader) {
    return false;
  }
  const origin = getRequestOrigin(req);
  return !origin || !allowedClientOrigins.has(origin);
}

function requireLocalControl(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return res.status(403).json({ error: "Local requests only" });
  }
  if (requestHasUntrustedOrigin(req)) {
    return res.status(403).json({ error: "Trusted local origin required" });
  }
  next();
}

function requireLocalLoopback(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return res.status(403).json({ error: "Local requests only" });
  }
  next();
}

function attachGithubState(base: AppState, req: express.Request) {
  const loggedIn = Boolean(req.session.githubToken);
  return {
    ...base,
    github: {
      ...base.github,
      loggedIn,
      user: loggedIn ? req.session.githubUser ?? null : null
    }
  };
}

function normalizeRepoPath(repoPath: string) {
  return path.resolve(repoPath);
}

function readRequestState(req: express.Request, res: express.Response) {
  const parsed = AppStateSchema.safeParse(req.body?.state);
  if (!parsed.success) {
    res.status(400).json({ error: "state is required and must be valid" });
    return null;
  }
  return parsed.data;
}

function unavailableCanonicalState(res: express.Response) {
  return res.status(410).json({
    error: "This endpoint is unavailable. Canonical app state lives in Supabase."
  });
}

function localGitErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Local git operation failed";
  if (
    message.includes("repo path must be inside configured watch directories") ||
    message.includes("since must be a valid date") ||
    message.includes("not a git repository")
  ) {
    return { status: 400, message };
  }
  return { status: 500, message };
}

function findLocalRepo(state: AppState, repoId?: string, repoPath?: string) {
  if (repoId) {
    return state.localRepos.find((repo) => repo.id === repoId) ?? null;
  }
  if (!repoPath) {
    return null;
  }
  const normalizedRepoPath = normalizeRepoPath(repoPath);
  return state.localRepos.find((repo) => normalizeRepoPath(repo.path) === normalizedRepoPath) ?? null;
}

function closeWeeklyReview(state: AppState, weekStart: string) {
  const review = generateWeeklyReview(state, weekStart);
  const weekEnd = review.weekEnd;
  const archivedGoals = Object.fromEntries(
    Object.entries(state.dailyGoalsByDate).map(([date, entry]) => {
      if (entry.date >= weekStart && entry.date <= weekEnd && !entry.archivedAt) {
        return [date, { ...entry, archivedAt: new Date().toISOString() }];
      }
      return [date, entry];
    })
  );

  const next: AppState = {
    ...state,
    weeklyReviews: [review, ...state.weeklyReviews],
    weeklySnapshots: [
      {
        id: crypto.randomUUID(),
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
        data: {
          review,
          projects: state.projects,
          goals: archivedGoals,
          roadmapCards: state.roadmapCards
        }
      },
      ...state.weeklySnapshots
    ],
    dailyGoalsByDate: archivedGoals
  };

  return { review, state: next };
}

// Simple in-memory rate limiter (no external dependency)
function createRateLimiter(windowMs: number, max: number, message: string) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const record = hits.get(key);
    if (!record || record.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const aiRateLimit = createRateLimiter(60_000, 5, "Too many plan requests. Please wait a minute.");
const authRateLimit = createRateLimiter(60_000, 20, "Too many requests. Please wait a minute.");
const scanRateLimit = createRateLimiter(30_000, 10, "Too many scan requests. Please slow down.");
const DEFAULT_ANTHROPIC_MODELS = [
  process.env.ANTHROPIC_MODEL,
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-20250514"
].filter(Boolean) as string[];

export const app = express();

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.removeHeader("X-Powered-By");
  next();
});

app.use((req, res, next) => {
  const origin = getRequestOrigin(req);
  if (origin && allowedClientOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    if (origin && allowedClientOrigins.has(origin) && isLoopbackAddress(req.socket.remoteAddress)) {
      return res.status(204).end();
    }
    return res.status(403).end();
  }

  next();
});

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", version: "2.5.0" });
});

app.get("/api/state", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.post("/api/state", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.get("/api/export", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.post("/api/import", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.post("/api/wipe", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.post("/api/git/link", requireLocalControl, (_req, res) => unavailableCanonicalState(res));
app.post("/api/git/unlink", requireLocalControl, (_req, res) => unavailableCanonicalState(res));

app.get("/api/startup/status", requireLocalControl, (_req, res) => {
  const osType = detectOS();
  const dir = getStartupDir();
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).map((file) => path.join(dir, file))
    : [];
  res.json({
    os: osType,
    instructions: startupInstructions(osType, dir, PORT),
    files
  });
});

app.get("/api/startup/health", requireLocalControl, async (_req, res) => {
  const health = getGitHealth();
  const scanStatus = health.scan;
  let gitAvailable = false;
  try {
    await execFileAsync("git", ["--version"]);
    gitAvailable = true;
  } catch {
    gitAvailable = false;
  }
  res.json({
    apiReachable: true,
    lastScanAt: scanStatus.lastRunAt,
    scanStatus,
    gitAvailable,
    repos: health.repos,
    dirtyRepos: health.dirty,
    watchDirs: [
      ...health.watchDirPaths.map((dir) => ({ dir, exists: true })),
      ...health.missingWatchDirs
        .filter((dir) => !health.watchDirPaths.includes(dir))
        .map((dir) => ({ dir, exists: false }))
    ]
  });
});

app.post("/api/backup/run", requireLocalControl, (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const retentionDays =
    typeof req.body?.retentionDays === "number"
      ? req.body.retentionDays
      : state.userSettings.backupRetentionDays ?? 14;
  const filepath = runBackupNow(state, retentionDays);
  res.json({ filepath, dir: getBackupDir() });
});

app.post("/api/weekly/generate", requireLocalControl, (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { weekStart } = req.body as { weekStart?: string };
  if (!weekStart) {
    return res.status(400).json({ error: "weekStart required" });
  }
  const review = generateWeeklyReview(state, weekStart);
  res.json({ review });
});

app.post("/api/weekly/close", requireLocalControl, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { weekStart } = req.body as { weekStart?: string };
  if (!weekStart) {
    return res.status(400).json({ error: "weekStart required" });
  }
  const closed = closeWeeklyReview(state, weekStart);
  const updated = await updateInsights(closed.state);
  res.json({ review: closed.review, state: attachGithubState(updated, req) });
});

app.post("/api/startup/create", requireLocalControl, (_req, res) => {
  const osType = detectOS();
  const rootDir = resolveRootDir();
  const { dir, files } = createStartupAssets(rootDir, PORT);
  res.json({
    os: osType,
    instructions: startupInstructions(osType, dir, PORT),
    files
  });
});

app.get("/api/git/repos", requireLocalControl, (_req, res) => {
  const status = getScanStatus();
  const health = getGitHealth();
  res.json({ repos: health.localRepos, scan: status, ...status, lastScanAt: status.lastRunAt });
});

app.get("/api/local-git/repos", requireLocalControl, (_req, res) => {
  const status = getScanStatus();
  const health = getGitHealth();
  res.json({ repos: health.localRepos, scan: status, ...status, lastScanAt: status.lastRunAt });
});

app.post("/api/git/scan", requireLocalControl, scanRateLimit, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { repoPath } = req.body as { repoPath?: string };
  try {
    const result = await runGitScanNow(state, repoPath ? normalizeRepoPath(repoPath) : undefined);
    const { state: scanState, nextState, ...rest } = result;
    res.json({ ...rest, scanState, state: nextState });
  } catch (err) {
    const error = localGitErrorResponse(err);
    res.status(error.status).json({ error: error.message });
  }
});

app.post("/api/local-git/scan", requireLocalControl, scanRateLimit, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { repoId, repoPath } = req.body as { repoId?: string; repoPath?: string };
  const repo = findLocalRepo(state, repoId, repoPath);
  if (repoId && !repo) {
    return res.status(404).json({ error: "Repo not found" });
  }
  const targetPath = repo?.path ?? (repoPath ? normalizeRepoPath(repoPath) : undefined);
  try {
    const result = await runGitScanNow(state, targetPath);
    const { state: scanState, nextState, ...rest } = result;
    res.json({ ...rest, scanState, state: nextState });
  } catch (err) {
    const error = localGitErrorResponse(err);
    res.status(error.status).json({ error: error.message });
  }
});

app.get("/api/git/commits", requireLocalControl, (_req, res) => {
  res.status(410).json({
    error: "Use /api/local-git/commits with request state in stateless mode."
  });
});

app.post("/api/local-git/commits", requireLocalControl, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { repoPath, limit = 10, since } = req.body as {
    repoPath?: string;
    limit?: number;
    since?: string;
  };
  if (!repoPath) {
    return res.status(400).json({ error: "repoPath required in stateless mode" });
  }

  const normalizedRepoPath = normalizeRepoPath(repoPath);
  try {
    const commits = await fetchLocalCommits(
      normalizedRepoPath,
      Number(limit) || 10,
      since,
      state.userSettings.repoWatchDirs
    );
    res.json({ repo: { path: normalizedRepoPath }, commits, scan: getScanStatus() });
  } catch (err) {
    const error = localGitErrorResponse(err);
    res.status(error.status).json({ error: error.message });
  }
});

app.get("/api/local-git/health", requireLocalControl, (_req, res) => {
  const health = getGitHealth();
  const scan = health.scan;
  res.json({
    repos: health.repos,
    dirty: health.dirty,
    errors: health.errors,
    lastScanAt: scan.lastRunAt,
    scanState: scan.state,
    durationMs: scan.durationMs,
    reposScanned: scan.reposScanned,
    reposChanged: scan.reposChanged,
    watcherActive: scan.watcherActive,
    missingWatchDirs: health.missingWatchDirs
  });
});

app.get("/api/local-git/status", requireLocalControl, (_req, res) => {
  res.json({ scan: getScanStatus() });
});

app.post("/api/insights/run", requireLocalControl, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const updated = await updateInsights(state);
  res.json({ insights: updated.insights, state: attachGithubState(updated, req) });
});

app.post("/api/insights/action", requireLocalControl, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) {
    return;
  }
  const { action } = req.body as { action?: unknown };
  if (!action) {
    return res.status(400).json({ error: "action required" });
  }
  try {
    const next = await runInsightAction(state, action as never);
    const updated = await updateInsights(next);
    res.json({ state: attachGithubState(updated, req) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insight action failed";
    res.status(400).json({ error: message });
  }
});

app.get("/auth/github/start", requireLocalControl, authRateLimit, (_req, res) => {
  res.status(410).send("GitHub connect moved to Supabase. Open Commits and use Connect GitHub.");
});

app.get("/auth/github/callback", requireLocalLoopback, (_req, res) => {
  res.status(410).send("Legacy GitHub OAuth callback is disabled. Reconnect GitHub from Commits.");
});

app.post("/auth/logout", requireLocalControl, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: "Failed to destroy session" });
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
  });
});

app.post("/api/github/user", async (req, res) => {
  const { pat } = req.body as { pat?: string };
  const token = pat || req.session.githubToken;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (pat) {
    try {
      const user = await fetchGithubUser(pat);
      return res.json({ user });
    } catch (err) {
      return res.status(401).json({ error: "Invalid PAT" });
    }
  }
  res.json({ user: req.session.githubUser });
});

app.post("/api/github/commits", async (req, res) => {
  const { repo, branch = "main", limit = 20, pat } = req.body as {
    repo?: string;
    branch?: string;
    limit?: number;
    pat?: string;
  };
  const token = pat || req.session.githubToken;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (!repo) {
    return res.status(400).json({ error: "Repo required" });
  }
  try {
    const result = await fetchGithubCommits({
      token,
      repo,
      branch: branch || "main",
      limit: Number(limit) || 20
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub fetch failed";
    const status =
      message.includes("Invalid GitHub repo") || message.includes("Invalid GitHub branch")
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

app.post("/api/github/commits/match", async (req, res) => {
  const { repo, branch = "main", text, limit = 30, pat } = req.body as {
    repo?: string;
    branch?: string;
    text?: string;
    limit?: number;
    pat?: string;
  };
  const token = (pat || req.session.githubToken) as string;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (!repo || !text) {
    return res.status(400).json({ error: "repo and text required" });
  }
  try {
    const result = await fetchGithubCommits({
      token,
      repo,
      branch,
      limit: Number(limit) || 30
    });
    const match = findMatchingCommit({ repo, text, commits: result.commits });
    res.json({ match, rateLimit: result.rateLimit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub fetch failed";
    const status =
      message.includes("Invalid GitHub repo") || message.includes("Invalid GitHub branch")
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

app.post("/api/ai/build-plan/quota", requireLocalControl, async (req, res) => {
  try {
    const quota = await fetchAiPlanQuotaStatus(req);
    res.json({ quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI plan quota.";
    const status = message === "Authentication required." ? 401 : 503;
    res.status(status).json({ error: message });
  }
});

app.post("/api/fill-my-day", requireLocalControl, aiRateLimit, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) return;

  let quota;
  try {
    quota = await fetchAiPlanQuotaStatus(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI plan quota.";
    const status = message === "Authentication required." ? 401 : 503;
    return res.status(status).json({ error: message });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI planning is not configured. Add ANTHROPIC_API_KEY to your server .env to enable Fill My Day."
    });
  }

  if (!quota.isAdmin && quota.remaining <= 0) {
    return res.status(429).json({ error: "quota_exceeded" });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Active projects with open tasks
  const projects = state.projects
    .filter((p) => p.status !== "Archived" && p.status !== "Done")
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      tasks: p.tasks
        .filter((t) => t.status !== "done" && !t.done)
        .map((t) => ({
          id: t.id,
          text: t.text,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate
        }))
    }))
    .filter((p) => p.tasks.length > 0);

  // Today's existing daily goals
  const todayGoals = (state.dailyGoalsByDate[todayStr]?.goals ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    points: g.points,
    done: g.done
  }));

  // Momentum score (today's execution score, or 50 if no data)
  const momentumScore = state.dailyGoalsByDate[todayStr]?.score ?? 50;

  // Roadmap cards in "now" lane
  const roadmapNowCards = state.roadmapCards
    .filter((c) => c.lane === "now")
    .map((c) => ({ id: c.id, title: c.title, project: c.project }));

  // Focus sessions from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentFocusSessions = state.focusSessions
    .filter((s) => s.startedAt >= sevenDaysAgo)
    .map((s) => ({ startedAt: s.startedAt, durationMinutes: s.durationMinutes, projectId: s.projectId }));

  // Active insights (not dismissed)
  const now = new Date().toISOString();
  const activeInsights = state.insights
    .filter((i) => !i.dismissedUntil || i.dismissedUntil < now)
    .map((i) => ({ id: i.id, ruleId: i.ruleId, projectId: i.projectId, severity: i.severity, title: i.title }));

  const systemPrompt = `You are Linkra's AI planner. Your job is to fill the user's day with the right tasks.

You will receive their current app state as JSON. Analyze:
1. Projects and their open tasks — prioritize by: high priority > overdue > linked to a "now" roadmap card > most recently touched project
2. Today's momentum score — if it's low (<40), suggest smaller quick-win tasks first
3. Existing daily goals for today — do NOT duplicate anything already planned
4. Focus session history — avoid overloading days where the user has already done 3+ sessions
5. Active signals/insights — if a project has a DEAD_WEIGHT or STALE_REPO signal, deprioritize it

Return ONLY a JSON array of goal objects, no explanation, no markdown:
[
  {
    "title": "string — short, action-oriented task title (max 60 chars)",
    "category": "string — project name or 'Admin' / 'Focus' / 'Review'",
    "points": number — between 5 and 20 based on estimated effort,
    "projectId": "string or null — the project id this task came from",
    "taskId": "string or null — the original task id if sourced from a task"
  }
]

Rules:
- Return between 3 and 8 goals. Never more than 8.
- Spread across at least 2 different projects if possible
- Total points should be between 30 and 80
- Titles must be action verbs: "Write...", "Fix...", "Review...", "Push...", "Close..."
- Do not include tasks that are already done`;

  const userMessage = JSON.stringify({ projects, todayGoals, momentumScore, roadmapNowCards, recentFocusSessions, activeInsights });

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    let message: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    let lastModelError: Error | null = null;

    for (const model of DEFAULT_ANTHROPIC_MODELS) {
      try {
        message = await client.messages.create({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }]
        });
        break;
      } catch (error) {
        const modelError = error instanceof Error ? error : new Error("Model request failed");
        lastModelError = modelError;
        if (!modelError.message.includes("not_found_error")) {
          break;
        }
      }
    }

    if (!message) {
      throw lastModelError ?? new Error("No Anthropic model is available for Fill My Day.");
    }

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("");

    // Extract JSON array from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to parse goals from AI response.");
    }
    const goals = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(goals)) {
      throw new Error("AI response was not an array of goals.");
    }

    const nextQuota = quota.isAdmin ? quota : await consumeAiPlanQuota(req);
    res.json({
      goals,
      quota: {
        used: nextQuota.used,
        remaining: nextQuota.remaining,
        dailyLimit: nextQuota.dailyLimit
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate goals";
    res.status(500).json({ error: message });
  }
});

app.post("/api/ai/build-plan", requireLocalControl, aiRateLimit, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) return;
  let quota;
  try {
    quota = await fetchAiPlanQuotaStatus(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI plan quota.";
    const status = message === "Authentication required." ? 401 : 503;
    return res.status(status).json({ error: message });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI planning is not configured. Add ANTHROPIC_API_KEY to your server .env to enable Build My Plan."
    });
  }

  const { prompt, queueTaskIds } = req.body as { prompt?: string; queueTaskIds?: string[] };
  const candidateTaskIds = Array.isArray(queueTaskIds)
    ? queueTaskIds.filter((taskId): taskId is string => typeof taskId === "string")
    : undefined;
  const { tasks, systemPrompt, userMessage } = createBuildPlanPrompt(state, prompt, new Date(), candidateTaskIds);

  if (tasks.length === 0) {
    return res.status(400).json({
      error: candidateTaskIds ? "No queued tasks available to build a plan from." : "No open tasks available to build a plan from."
    });
  }

  if (!quota.isAdmin && quota.remaining <= 0) {
    return res.status(429).json({
      error: `Daily Build My Plan limit reached. ${quota.remaining}/${quota.dailyLimit} left today.`
    });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    let message: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    let lastModelError: Error | null = null;

    for (const model of DEFAULT_ANTHROPIC_MODELS) {
      try {
        message = await client.messages.create({
          model,
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }]
        });
        break;
      } catch (error) {
        const modelError = error instanceof Error ? error : new Error("Model request failed");
        lastModelError = modelError;
        if (!modelError.message.includes("not_found_error")) {
          // Non-404 error (rate limit, auth failure, etc.) — stop trying models
          // and surface the error, matching Cloudflare function behavior.
          break;
        }
      }
    }

    if (!message) {
      throw lastModelError ?? new Error("No Anthropic model is available for Build My Plan.");
    }

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("");
    const plan = parseBuildPlanResponse(rawText, tasks.map((task) => task.id));
    const nextQuota = quota.isAdmin ? quota : await consumeAiPlanQuota(req);
    res.json({ ...plan, quota: nextQuota });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate plan";
    res.status(500).json({ error: message });
  }
});

// ── Agent helpers ─────────────────────────────────────────────────────────────

function buildAgentStateContext(state: AppState): string {
  const todayStr = new Date().toISOString().split("T")[0];
  const todayGoals = state.dailyGoalsByDate[todayStr];
  const summary = {
    projects: state.projects
      .filter((p) => p.status !== "Archived")
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        openTasks: p.tasks
          .filter((t) => !t.done)
          .map((t) => ({ id: t.id, text: t.text, priority: t.priority, dueDate: t.dueDate })),
        completedTaskCount: p.tasks.filter((t) => t.done).length
      })),
    todayGoals: todayGoals
      ? {
          date: todayGoals.date,
          goals: todayGoals.goals.map((g) => ({ id: g.id, title: g.title, done: g.done, points: g.points }))
        }
      : null,
    roadmapCards: state.roadmapCards
      .filter((c) => c.lane !== "shipped")
      .map((c) => ({ id: c.id, title: c.title, lane: c.lane, description: c.description })),
    recentSessions: state.sessionLogs
      .slice(0, 5)
      .map((s) => ({ id: s.id, text: s.text, project: s.project, ts: s.ts }))
  };
  return JSON.stringify(summary, null, 2);
}

async function executeAgentAction(
  req: express.Request,
  action: { type: string; payload: Record<string, unknown> }
) {
  const stateData = await readSupabaseAppState(req);
  const parsed = AppStateSchema.safeParse(stateData);
  if (!parsed.success) throw new Error("Invalid app state from Supabase");
  let state: AppState = parsed.data;
  const now = new Date().toISOString();
  const todayStr = now.split("T")[0];

  switch (action.type) {
    case "CREATE_TASK": {
      const { projectId, text, priority, dueDate } = action.payload as Record<string, unknown>;
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      const newTask = {
        id: crypto.randomUUID(),
        text: String(text),
        done: false,
        status: "todo" as const,
        dependsOnIds: [],
        priority: (priority as "low" | "med" | "high") || "med",
        dueDate: dueDate ? String(dueDate) : null,
        milestone: null,
        createdAt: now,
        completedAt: null,
        linkedCommit: null
      };
      state = {
        ...state,
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p
        )
      };
      break;
    }
    case "COMPLETE_TASK": {
      const { projectId, taskId } = action.payload as Record<string, unknown>;
      state = {
        ...state,
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                tasks: p.tasks.map((t) =>
                  t.id === taskId ? { ...t, done: true, status: "done" as const, completedAt: now } : t
                )
              }
            : p
        )
      };
      break;
    }
    case "ADD_GOAL": {
      const { title, category, points } = action.payload as Record<string, unknown>;
      const entry = state.dailyGoalsByDate[todayStr];
      const newGoal = {
        id: crypto.randomUUID(),
        title: String(title),
        category: String(category || "General"),
        points: Number(points) || 1,
        done: false,
        createdAt: now,
        completedAt: null
      };
      if (entry) {
        state = {
          ...state,
          dailyGoalsByDate: {
            ...state.dailyGoalsByDate,
            [todayStr]: { ...entry, goals: [...entry.goals, newGoal] }
          }
        };
      } else {
        state = {
          ...state,
          dailyGoalsByDate: {
            ...state.dailyGoalsByDate,
            [todayStr]: {
              date: todayStr,
              goals: [newGoal],
              score: 0,
              completedPoints: 0,
              isClosed: false,
              archivedAt: null
            }
          }
        };
      }
      break;
    }
    case "COMPLETE_GOAL": {
      const { goalId } = action.payload as Record<string, unknown>;
      const entry = state.dailyGoalsByDate[todayStr];
      if (entry) {
        const updatedGoals = entry.goals.map((g) =>
          g.id === goalId ? { ...g, done: true, completedAt: now } : g
        );
        const completedPoints = updatedGoals.filter((g) => g.done).reduce((sum, g) => sum + g.points, 0);
        state = {
          ...state,
          dailyGoalsByDate: {
            ...state.dailyGoalsByDate,
            [todayStr]: { ...entry, goals: updatedGoals, completedPoints, score: completedPoints }
          }
        };
      }
      break;
    }
    case "MOVE_ROADMAP_CARD": {
      const { cardId, lane } = action.payload as Record<string, unknown>;
      state = {
        ...state,
        roadmapCards: state.roadmapCards.map((c) =>
          c.id === cardId ? { ...c, lane: lane as "now" | "next" | "later" | "shipped", updatedAt: now } : c
        )
      };
      break;
    }
    case "CREATE_ROADMAP_CARD": {
      const { title, lane, description, projectId } = action.payload as Record<string, unknown>;
      const newCard = {
        id: crypto.randomUUID(),
        lane: (lane as "now" | "next" | "later") || "next",
        title: String(title),
        description: String(description || ""),
        tags: [],
        linkedRepo: null,
        dueDate: null,
        project: projectId ? String(projectId) : null,
        createdAt: now,
        updatedAt: now
      };
      state = { ...state, roadmapCards: [...state.roadmapCards, newCard] };
      break;
    }
    case "LOG_SESSION": {
      const { text, project } = action.payload as Record<string, unknown>;
      const newSession = {
        id: crypto.randomUUID(),
        ts: now,
        text: String(text),
        project: project ? String(project) : null,
        tags: []
      };
      state = { ...state, sessionLogs: [newSession, ...state.sessionLogs] };
      break;
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }

  await writeSupabaseAppState(req, state);
}

const AGENT_SYSTEM_PROMPT = `You are Linkra Agent — an embedded AI assistant with direct access to the user's personal command center. You can read their data AND take real actions on it.

You have access to the following tools. When you want to use one, respond with a JSON block in this exact format on its own line:
ACTION: { "type": "TOOL_NAME", "payload": { ... } }

Available tools:

READ_STATE — read the full app state (no payload needed)
CREATE_TASK — { "projectId": string, "text": string, "priority": "low"|"med"|"high", "dueDate": string|null }
COMPLETE_TASK — { "projectId": string, "taskId": string }
ADD_GOAL — { "title": string, "category": string, "points": number }
COMPLETE_GOAL — { "goalId": string }
MOVE_ROADMAP_CARD — { "cardId": string, "lane": "now"|"next"|"later"|"shipped" }
CREATE_ROADMAP_CARD — { "title": string, "lane": "now"|"next"|"later", "description": string, "projectId": string|null }
LOG_SESSION — { "text": string, "project": string|null }

Rules:
- Always read state first before taking any action so you have current context
- Confirm before doing destructive or bulk actions — ask "Should I go ahead?"
- After taking an action, describe what you did in plain English
- You can chain multiple actions in one response if the user asks for something that requires it (e.g. "wrap up my day" = complete remaining goals + log a session)
- Keep responses concise — you're a doer, not an explainer
- If you don't have a tool for something, say so honestly

Tone and communication rules:
- Talk like a sharp, direct coworker — not a productivity report
- No markdown. No bullet points. No bold text. No headers. Plain sentences only.
- Keep replies short — 2 to 4 sentences max unless the user explicitly asks for a breakdown or list
- Never say things like "Here's what I'd recommend:" or "Based on your state:" — just say the thing directly
- Never summarize what you are about to do before doing it
- Match the user's energy. If they say "hi", say hi back naturally and ask what they're working on. Do not immediately read state or plan their day.
- Only read state and offer planning when the user actually asks for it — "what should I work on", "fill my day", "what's going on", etc.
- If the user sends a casual message, respond casually. Save the agent capabilities for when they're needed.
- When you do take an action, confirm it in one sentence. Not a paragraph.`;

app.get("/api/agent-quota", requireLocalControl, async (req, res) => {
  try {
    const status = await getAgentQuotaStatus(req);
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load agent quota.";
    const httpStatus = message === "Authentication required." ? 401 : 503;
    res.status(httpStatus).json({ error: message });
  }
});

app.post("/api/agent", requireLocalControl, aiRateLimit, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI is not configured. Add ANTHROPIC_API_KEY to your server .env."
    });
  }

  let agentQuota;
  try {
    agentQuota = await checkAgentQuota(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load quota.";
    const httpStatus = message === "Authentication required." ? 401 : 503;
    return res.status(httpStatus).json({ error: message });
  }

  if (!agentQuota.allowed) {
    return res.status(429).json({
      error: "agent_quota_exceeded",
      used: agentQuota.used,
      limit: agentQuota.limit,
      reset_in_minutes: agentQuota.reset_in_minutes
    });
  }

  const { messages, conversationId: incomingConvId } = req.body as {
    messages: { role: string; content: string }[];
    conversationId?: string | null;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  let userId: string;
  try {
    userId = getUserIdFromToken(req);
  } catch {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const callClaude = async (msgs: { role: string; content: string }[]): Promise<string> => {
      let result: Awaited<ReturnType<typeof client.messages.create>> | null = null;
      let lastError: Error | null = null;
      for (const model of DEFAULT_ANTHROPIC_MODELS) {
        try {
          result = await client.messages.create({
            model,
            max_tokens: 1024,
            system: AGENT_SYSTEM_PROMPT,
            messages: msgs.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content
            }))
          });
          break;
        } catch (error) {
          const e = error instanceof Error ? error : new Error("Model request failed");
          lastError = e;
          if (!e.message.includes("not_found_error")) break;
        }
      }
      if (!result) throw lastError ?? new Error("No Anthropic model available for Agent.");
      return result.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    };

    let rawText = await callClaude(messages);
    let actionTaken: string | null = null;
    let updatedState = false;

    const actionMatch = rawText.match(/^ACTION:\s*(\{.+?\})\s*$/m);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1]) as { type: string; payload: Record<string, unknown> };

        if (action.type === "READ_STATE") {
          const stateData = await readSupabaseAppState(req);
          const stateContext = buildAgentStateContext(stateData as AppState);
          const messagesWithContext = [
            ...messages,
            { role: "assistant", content: rawText },
            {
              role: "user",
              content: `Current state:\n${stateContext}\n\nPlease answer based on this.`
            }
          ];
          rawText = await callClaude(messagesWithContext);
          actionTaken = "READ_STATE";
        } else {
          await executeAgentAction(req, action);
          actionTaken = action.type;
          updatedState = true;
        }
      } catch (e) {
        console.error("Agent action error:", e);
      }
    }

    const reply = rawText.replace(/^ACTION:\s*\{.+?\}\s*$/m, "").trim();

    // ── Persist to Supabase ────────────────────────────────────────────────
    let conversationId = incomingConvId ?? null;
    let isNewConversation = false;

    try {
      if (!conversationId) {
        // Auto-title: use first user message (trim to 60 chars)
        const firstUserMsg = messages.find((m) => m.role === "user")?.content ?? "New conversation";
        let title = firstUserMsg.slice(0, 60);
        if (firstUserMsg.length > 60) title += "…";

        // Try to generate a smarter title if we have a model
        try {
          const titleResp = await client.messages.create({
            model: DEFAULT_ANTHROPIC_MODELS[0],
            max_tokens: 20,
            messages: [{ role: "user", content: `Write a 4-6 word title for a conversation starting with: "${firstUserMsg.slice(0, 120)}"` }]
          });
          const generated = titleResp.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("").trim().replace(/^["']|["']$/g, "");
          if (generated.length > 3 && generated.length < 80) title = generated;
        } catch { /* non-fatal */ }

        const conv = await createAgentConversation(req, title);
        conversationId = conv.id;
        isNewConversation = true;
      } else {
        await touchConversation(req, conversationId);
      }

      // Only persist the last user message + the new assistant reply
      // (prior messages are already in DB from previous turns)
      const lastUserMsg = messages[messages.length - 1];
      const rowsToInsert = [];
      if (isNewConversation) {
        // New conversation: persist all messages
        for (const m of messages) {
          rowsToInsert.push({ conversation_id: conversationId, user_id: userId, role: m.role as "user" | "assistant", content: m.content, action_taken: null });
        }
      } else {
        // Existing conversation: only the latest user message
        rowsToInsert.push({ conversation_id: conversationId, user_id: userId, role: lastUserMsg.role as "user" | "assistant", content: lastUserMsg.content, action_taken: null });
      }
      // Always add assistant reply
      rowsToInsert.push({ conversation_id: conversationId, user_id: userId, role: "assistant" as const, content: reply, action_taken: actionTaken });
      await insertAgentMessages(req, rowsToInsert);
    } catch (persistErr) {
      console.error("Failed to persist agent conversation:", persistErr);
      // Non-fatal — still return the reply
    }

    res.json({
      reply,
      actionTaken,
      updatedState,
      conversationId,
      quota: { used: agentQuota.used, limit: agentQuota.limit, reset_in_minutes: agentQuota.reset_in_minutes }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent request failed";
    res.status(500).json({ error: message });
  }
});

app.get("/api/agent/conversations", requireLocalControl, async (req, res) => {
  try {
    const conversations = await listAgentConversations(req);
    res.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load conversations.";
    const httpStatus = message === "Authentication required." ? 401 : 503;
    res.status(httpStatus).json({ error: message });
  }
});

app.get("/api/agent/conversations/:id/messages", requireLocalControl, async (req, res) => {
  try {
    const owned = await verifyConversationOwner(req, req.params.id);
    if (!owned) return res.status(404).json({ error: "Conversation not found." });
    const messages = await getAgentConversationMessages(req, req.params.id);
    res.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load messages.";
    const httpStatus = message === "Authentication required." ? 401 : 503;
    res.status(httpStatus).json({ error: message });
  }
});

app.delete("/api/agent/conversations/:id", requireLocalControl, async (req, res) => {
  try {
    const owned = await verifyConversationOwner(req, req.params.id);
    if (!owned) return res.status(404).json({ error: "Conversation not found." });
    await deleteAgentConversation(req, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete conversation.";
    const httpStatus = message === "Authentication required." ? 401 : 503;
    res.status(httpStatus).json({ error: message });
  }
});

const webDist = path.resolve(resolveRootDir(), "apps/web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

export async function start() {
  // Load persisted store from disk before starting background services.
  // Without this, getState() returns default (empty) settings and the
  // scheduler/watcher would have no watch dirs to act on.
  await loadStore();
  startGitScanScheduler();
  startGitWatcher();

  return new Promise<void>((resolve) => {
    app.listen(PORT, HOST, () => {
      console.log(`Linkra server running on http://${HOST}:${PORT}`);
      resolve();
    });
  });
}

function resolveRootDir() {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join("apps", "server"))) {
    return path.resolve(cwd, "../..");
  }
  if (cwd.endsWith(path.join("apps", "server", "dist"))) {
    return path.resolve(cwd, "../../..");
  }
  return cwd;
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (entryFile === currentFile) {
  void start();
}
