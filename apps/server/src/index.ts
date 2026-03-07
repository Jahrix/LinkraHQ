import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AppStateSchema, generateWeeklyReview, type AppState } from "@linkra/shared";
import {
  githubAuthUrl,
  exchangeCodeForToken,
  fetchGithubCommits,
  fetchGithubUser,
  findMatchingCommit
} from "./github.js";
import { createStartupAssets, detectOS, startupInstructions, getStartupDir } from "./startup.js";
import { getGitHealth, getScanStatus, runGitScanNow, fetchLocalCommits } from "./gitScan.js";
import { updateInsights, runInsightAction } from "./insights.js";
import { runBackupNow, getBackupDir } from "./backup.js";

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);
dotenv.config({ path: path.resolve(__dirname_local, "../.env") });

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4170);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
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
const fallbackClientOrigin = allowedClientOrigins.values().next().value ?? DEFAULT_CLIENT_ORIGIN;
const LOCAL_SERVER_ORIGIN =
  normalizeOrigin(process.env.LOCAL_SERVER_ORIGIN || "") ?? `http://${HOST}:${PORT}`;

function isLoopbackAddress(address?: string | null) {
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

function getStoredOauthOrigin(req: express.Request) {
  return normalizeOrigin(req.session.oauthOrigin ?? "") ?? fallbackClientOrigin;
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

app.get("/auth/github/start", requireLocalControl, authRateLimit, (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(400).send("GitHub OAuth is not configured.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const origin = getRequestOrigin(req);
  if (origin && allowedClientOrigins.has(origin)) {
    req.session.oauthOrigin = origin;
  } else {
    delete req.session.oauthOrigin;
  }

  const redirectUri = `${LOCAL_SERVER_ORIGIN}/auth/github/callback`;
  res.redirect(githubAuthUrl(GITHUB_CLIENT_ID, redirectUri, state));
});

app.get("/auth/github/callback", requireLocalLoopback, async (req, res) => {
  const clientOrigin = getStoredOauthOrigin(req);

  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send("Invalid OAuth state.");
    }
    const redirectUri = `${LOCAL_SERVER_ORIGIN}/auth/github/callback`;
    const token = await exchangeCodeForToken({
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      code,
      redirectUri
    });
    const user = await fetchGithubUser(token);
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) {
          reject(error);
          return;
        }
        req.session.githubToken = token;
        req.session.githubUser = user;
        delete req.session.oauthState;
        delete req.session.oauthOrigin;
        req.session.save((saveError) => {
          if (saveError) {
            reject(saveError);
            return;
          }
          resolve();
        });
      });
    });
    res.redirect(`${clientOrigin}/#commits?auth=success`);
  } catch {
    res.redirect(`${clientOrigin}/#commits?auth=error`);
  }
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

app.get("/api/github/user", requireLocalControl, (req, res) => {
  if (!req.session.githubToken) {
    return res.status(401).json({ error: "Not logged in" });
  }
  res.json({ user: req.session.githubUser });
});

app.get("/api/github/commits", requireLocalControl, async (req, res) => {
  const { repo, branch = "main", limit = "20" } = req.query as Record<string, string>;
  if (!req.session.githubToken) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (!repo) {
    return res.status(400).json({ error: "Repo required" });
  }
  try {
    const result = await fetchGithubCommits({
      token: req.session.githubToken,
      repo,
      branch,
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

app.post("/api/github/commits/match", requireLocalControl, async (req, res) => {
  const { repo, branch = "main", text, limit = 30 } = req.body as {
    repo?: string;
    branch?: string;
    text?: string;
    limit?: number;
  };
  if (!req.session.githubToken) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (!repo || !text) {
    return res.status(400).json({ error: "repo and text required" });
  }
  try {
    const result = await fetchGithubCommits({
      token: req.session.githubToken,
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

app.post("/api/ai/build-plan", requireLocalControl, aiRateLimit, async (req, res) => {
  const state = readRequestState(req, res);
  if (!state) return;

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI planning is not configured. Add ANTHROPIC_API_KEY to your server .env to enable Build My Plan."
    });
  }

  // Gather relevant context from state
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const activeProjects = state.projects.filter((p) => p.status !== "Archived");

  type TaskContext = {
    id: string;
    text: string;
    project: string;
    priority: string;
    dueDate: string | null;
    isOverdue: boolean;
    status: string;
  };

  const allTasks: TaskContext[] = activeProjects.flatMap((project) =>
    project.tasks
      .filter((t) => !t.done)
      .map((t) => ({
        id: t.id,
        text: t.text,
        project: project.name,
        priority: t.priority,
        dueDate: t.dueDate ?? null,
        isOverdue: t.dueDate ? t.dueDate < today : false,
        status: t.status
      }))
  );

  const roadmapNow = state.roadmapCards
    .filter((c) => c.lane === "now")
    .map((c) => c.title)
    .slice(0, 5);

  const activeInsights = state.insights
    .filter((i) => !i.dismissedUntil || i.dismissedUntil < now)
    .filter((i) => i.severity !== "info")
    .map((i) => `${i.title}: ${i.reason}`)
    .slice(0, 5);

  const localRepos = (state.localRepos ?? []).map((r) => ({
    name: r.name,
    dirty: r.dirty,
    untrackedCount: r.untrackedCount,
    todayCommitCount: r.todayCommitCount,
    ahead: r.ahead,
    behind: r.behind
  }));

  const contextSummary = {
    date: today,
    projects: activeProjects.map((p) => ({
      name: p.name,
      status: p.status,
      weeklyHours: p.weeklyHours,
      tasksTotal: p.tasks.length,
      tasksDone: p.tasks.filter((t) => t.done).length
    })),
    tasks: allTasks.slice(0, 30),
    roadmapNowItems: roadmapNow,
    activeSignals: activeInsights,
    localRepos: localRepos.slice(0, 10)
  };

  const systemPrompt = `You are an elite personal command center for a developer. Your job: generate the best possible daily work plan.

Rules:
- Return exactly a JSON object: { "taskIds": string[], "rationale": string }
- taskIds: 4-6 task IDs from the provided list only. Max 6.
- rationale: 1-2 tight sentences. Confident tone. No hedging. Example: "These moves will ship visible progress on your highest-priority work today."
- Do not include done tasks. Do not invent tasks.
- Return only valid JSON, no markdown fences.

Priority order (highest to lowest):
1. Overdue tasks (isOverdue: true) — these must ship
2. High-priority tasks in active "In Progress" projects
3. Tasks aligned to roadmap "Now" items
4. Tasks from projects with active signals or warnings
5. Tasks from projects with the most weekly hours invested
6. Unblocked tasks that visibly advance a project (over cleanup or filler)

Avoid:
- Generic maintenance unless it unblocks real work
- Tasks from On Hold or Done projects
- Stuffing the plan with low-value items just to fill slots`;

  const userMessage = `Today is ${today}. Here is my work context:
${JSON.stringify(contextSummary, null, 2)}

Build my plan. Return JSON only: {"taskIds": [...], "rationale": "..."}`;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as any).text)
      .join("");

    // Strip markdown fences if present
    const cleaned = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.taskIds) || typeof parsed.rationale !== "string") {
      throw new Error("Unexpected response shape from Claude");
    }

    // Validate that all returned IDs exist in our task list
    const validIds = new Set(allTasks.map((t) => t.id));
    const filteredIds = (parsed.taskIds as string[]).filter((id) => validIds.has(id)).slice(0, 6);

    res.json({ taskIds: filteredIds, rationale: parsed.rationale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate plan";
    res.status(500).json({ error: message });
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
