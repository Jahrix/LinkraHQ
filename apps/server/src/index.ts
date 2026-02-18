import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  AppStateSchema,
  ExportBundleSchema,
  SCHEMA_VERSION
} from "@linkra/shared";
import {
  loadStore,
  getState,
  saveState,
  ensureDailyGoals,
  mergeStates,
  normalizeState,
  wipeState
} from "./store.js";
import {
  githubAuthUrl,
  exchangeCodeForToken,
  fetchGithubCommits,
  fetchGithubUser,
  findMatchingCommit
} from "./github.js";
import { createStartupAssets, detectOS, startupInstructions, getStartupDir } from "./startup.js";
import { getScanStatus, runGitScanNow, startGitScanScheduler, fetchLocalCommits } from "./gitScan.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4170);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SESSION_SECRET = process.env.SESSION_SECRET || "linkra-dev-secret";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

const app = express();

app.use(
  session({
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

function attachGithubState(base: any, req: express.Request) {
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

app.get("/api/state", async (req, res) => {
  ensureDailyGoals();
  const state = getState();
  res.json({ state: attachGithubState(state, req) });
});

app.post("/api/state", async (req, res) => {
  const parsed = AppStateSchema.safeParse(req.body.state);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  await saveState(parsed.data);
  ensureDailyGoals();
  const state = getState();
  res.json({ state: attachGithubState(state, req) });
});

app.get("/api/export", (req, res) => {
  const state = getState();
  res.json({
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    data: attachGithubState(state, req)
  });
});

app.post("/api/import", async (req, res) => {
  const { mode, data } = req.body as { mode: "replace" | "merge"; data: any };
  const parsed = ExportBundleSchema.safeParse(data);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const incoming = normalizeState(parsed.data.data);
  if (mode === "merge") {
    const merged = mergeStates(getState(), incoming);
    await saveState(merged);
  } else {
    await saveState(incoming);
  }
  ensureDailyGoals();
  res.json({ state: attachGithubState(getState(), req) });
});

app.post("/api/wipe", async (req, res) => {
  await wipeState();
  ensureDailyGoals();
  res.json({ state: attachGithubState(getState(), req) });
});

app.get("/api/startup/status", (req, res) => {
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

app.post("/api/startup/create", (req, res) => {
  const osType = detectOS();
  const rootDir = resolveRootDir();
  const { dir, files } = createStartupAssets(rootDir, PORT);
  res.json({
    os: osType,
    instructions: startupInstructions(osType, dir, PORT),
    files
  });
});

app.get("/api/git/repos", (req, res) => {
  const status = getScanStatus();
  res.json({ repos: getState().localRepos, ...status });
});

app.post("/api/git/scan", async (req, res) => {
  const result = await runGitScanNow();
  res.json(result);
});

app.post("/api/git/link", async (req, res) => {
  const { projectId, repoPath } = req.body as { projectId?: string; repoPath?: string };
  if (!projectId || !repoPath) {
    return res.status(400).json({ error: "projectId and repoPath required" });
  }
  const next = getState();
  const project = next.projects.find((item) => item.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  project.localRepoPath = repoPath;
  await saveState(next);
  res.json({ state: attachGithubState(getState(), req) });
});

app.post("/api/git/unlink", async (req, res) => {
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }
  const next = getState();
  const project = next.projects.find((item) => item.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  project.localRepoPath = null;
  await saveState(next);
  res.json({ state: attachGithubState(getState(), req) });
});

app.get("/api/git/commits", async (req, res) => {
  const { repoPath, limit = "10" } = req.query as Record<string, string>;
  if (!repoPath) {
    return res.status(400).json({ error: "repoPath required" });
  }
  try {
    const commits = await fetchLocalCommits(repoPath, Number(limit) || 10);
    res.json({ commits });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Local git fetch failed" });
  }
});

app.get("/auth/github/start", (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(400).send("GitHub OAuth is not configured.");
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const redirectUri = `http://localhost:${PORT}/auth/github/callback`;
  res.redirect(githubAuthUrl(GITHUB_CLIENT_ID, redirectUri, state));
});

app.get("/auth/github/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send("Invalid OAuth state.");
    }
    const redirectUri = `http://localhost:${PORT}/auth/github/callback`;
    const token = await exchangeCodeForToken({
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      code,
      redirectUri
    });
    const user = await fetchGithubUser(token);
    req.session.githubToken = token;
    req.session.githubUser = user;
    res.redirect(`${CLIENT_ORIGIN}/#/settings?auth=success`);
  } catch (err) {
    res.redirect(`${CLIENT_ORIGIN}/#/settings?auth=error`);
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/github/user", (req, res) => {
  if (!req.session.githubToken) {
    return res.status(401).json({ error: "Not logged in" });
  }
  res.json({ user: req.session.githubUser });
});

app.get("/api/github/commits", async (req, res) => {
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
    const state = getState();
    state.github.lastSyncAt = new Date().toISOString();
    state.github.rateLimit = result.rateLimit;
    await saveState(state);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "GitHub fetch failed" });
  }
});

app.post("/api/github/commits/match", async (req, res) => {
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
    const state = getState();
    state.github.lastSyncAt = new Date().toISOString();
    state.github.rateLimit = result.rateLimit;
    await saveState(state);
    res.json({ match, rateLimit: result.rateLimit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "GitHub fetch failed" });
  }
});

const webDist = path.resolve(resolveRootDir(), "apps/web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

async function start() {
  await loadStore();
  ensureDailyGoals();
  await runGitScanNow();
  startGitScanScheduler();
  app.listen(PORT, () => {
    console.log(`Linkra server running on http://localhost:${PORT}`);
  });
}

start();

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
