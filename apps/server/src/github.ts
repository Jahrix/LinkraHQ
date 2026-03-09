import fetch from "node-fetch";
import { normalizeRepo } from "@linkra/shared";

interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
}

const GITHUB_TIMEOUT_MS = 10_000;
const MAX_GITHUB_COMMITS = 100;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_BRANCH_PATTERN = /^(?![/.])(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+$/;

export function githubAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:user",
    state
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken({
  clientId,
  clientSecret,
  code,
  redirectUri
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(data.error || "Failed to get access token");
  }
  return data.access_token;
}

export async function fetchGithubUser(token: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error("Failed to fetch GitHub user");
  }
  const user = (await response.json()) as GithubUser;
  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url
  };
}

export async function fetchGithubCommits({
  token,
  repo,
  branch,
  limit
}: {
  token: string;
  repo: string;
  branch: string;
  limit: number;
}) {
  const response = await fetch(buildGithubCommitsUrl(repo, branch, limit), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  });

  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  const data = (await response.json()) as any[];
  const commits = data.map((item) => ({
    sha: item.sha,
    shortSha: item.sha.slice(0, 7),
    message: item.commit.message.split("\n")[0],
    author: item.commit.author.name,
    date: item.commit.author.date,
    url: item.html_url
  }));
  return {
    commits,
    rateLimit:
      Number.isFinite(remaining) && Number.isFinite(reset)
        ? { remaining, reset }
        : null
  };
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "then",
  "than",
  "your",
  "you",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "add",
  "fix",
  "feat",
  "refactor",
  "update",
  "remove",
  "use",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "is",
  "it",
  "a",
  "an"
]);

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function matchScore(tokens: string[], message: string) {
  if (!tokens.length) return { score: 0, matches: 0 };
  const commitTokens = new Set(tokenize(message));
  const matches = tokens.filter((token) => commitTokens.has(token));
  const score = matches.length / tokens.length;
  return { score, matches: matches.length };
}

export function findMatchingCommit({
  repo,
  text,
  commits
}: {
  repo: string;
  text: string;
  commits: Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  }>;
}) {
  const repoTokens = tokenize(repo.replace("/", " "));
  const tokens = Array.from(new Set([...tokenize(text), ...repoTokens]));
  let best = null as null | { score: number; matches: number; commit: any };

  for (const commit of commits) {
    const { score, matches } = matchScore(tokens, commit.message);
    if (!best || score > best.score || (score === best.score && matches > best.matches)) {
      best = { score, matches, commit };
    }
  }

  if (!best) return null;
  const { score, matches, commit } = best;
  const strongSingle = matches === 1 && tokens.some((token) => token.length >= 5);
  if (matches >= 2 || score >= 0.3 || strongSingle) {
    return { ...commit, score: Math.round(score * 100) };
  }
  return null;
}

function buildGithubCommitsUrl(repo: string, branch: string, limit: number) {
  const normalizedRepo = normalizeRepo(repo);
  const normalizedBranch = branch.trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_GITHUB_COMMITS);

  if (!GITHUB_REPO_PATTERN.test(normalizedRepo)) {
    throw new Error("Invalid GitHub repo. Use owner/repo.");
  }

  if (!normalizedBranch || !GITHUB_BRANCH_PATTERN.test(normalizedBranch)) {
    throw new Error("Invalid GitHub branch name.");
  }

  const url = new URL(`https://api.github.com/repos/${normalizedRepo}/commits`);
  url.searchParams.set("sha", normalizedBranch);
  url.searchParams.set("per_page", String(safeLimit));
  return url.toString();
}
