import type { Session, User, UserIdentity } from "@supabase/supabase-js";

export interface GithubUserProfile {
  login: string;
  avatarUrl: string | null;
  name: string | null;
}

export interface GithubCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export const GITHUB_AUTH_SCOPES = "repo read:user";

type GithubOAuthOptions = {
  provider: "github";
  options: {
    redirectTo: string;
    scopes: string;
  };
};

type GithubAuthClient = {
  linkIdentity: (options: GithubOAuthOptions) => Promise<{ error: { message: string } | null }>;
  signInWithOAuth: (options: GithubOAuthOptions) => Promise<{ error: { message: string } | null }>;
};

export function buildCommitsRedirectUrl(locationLike: {
  origin: string;
  pathname: string;
  search: string;
}) {
  return `${locationLike.origin}${locationLike.pathname}${locationLike.search}#commits`;
}

export function hasGithubIdentity(user: Pick<User, "app_metadata" | "identities"> | null | undefined) {
  if (!user) {
    return false;
  }
  if (user.app_metadata?.providers?.includes("github")) {
    return true;
  }
  return user.identities?.some((identity) => identity.provider === "github") ?? false;
}

export function getGithubIdentity(user: Pick<User, "identities"> | null | undefined): UserIdentity | null {
  return user?.identities?.find((identity) => identity.provider === "github") ?? null;
}

export function getGithubIdentityProfile(
  user: Pick<User, "app_metadata" | "identities"> | null | undefined
): GithubUserProfile | null {
  const identity = getGithubIdentity(user);
  const identityData = identity?.identity_data ?? {};
  const login =
    firstString(identityData.user_name, identityData.preferred_username, identityData.login) ??
    null;

  if (!login && !hasGithubIdentity(user)) {
    return null;
  }

  return {
    login: login ?? "github",
    avatarUrl: firstString(identityData.avatar_url, identityData.picture) ?? null,
    name: firstString(identityData.full_name, identityData.name) ?? null
  };
}

export async function startGithubConnect(
  auth: GithubAuthClient,
  redirectTo: string,
  hasExistingSession: boolean
) {
  const options = {
    provider: "github" as const,
    options: {
      redirectTo,
      scopes: GITHUB_AUTH_SCOPES
    }
  };

  if (hasExistingSession) {
    return auth.linkIdentity(options);
  }

  return auth.signInWithOAuth(options);
}

export function getGithubProviderToken(session: Pick<Session, "provider_token"> | null | undefined) {
  return session?.provider_token ?? null;
}

export async function fetchGithubUserProfile(token: string): Promise<GithubUserProfile> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(formatGithubApiError("Failed to fetch GitHub user", response.status));
  }

  const payload = (await response.json()) as {
    login: string;
    avatar_url: string | null;
    name: string | null;
  };

  return {
    login: payload.login,
    avatarUrl: payload.avatar_url,
    name: payload.name
  };
}

export async function fetchGithubRepoCommits(
  token: string,
  repo: string,
  branch: string,
  limit: number
) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(formatGithubApiError(`GitHub API error for ${repo}`, response.status));
  }

  const payload = (await response.json()) as Array<{
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: {
        name: string;
        date: string;
      };
    };
  }>;

  return {
    commits: payload.map((item) => ({
      sha: item.sha,
      shortSha: item.sha.slice(0, 7),
      message: item.commit.message.split("\n")[0],
      author: item.commit.author.name,
      date: item.commit.author.date,
      url: item.html_url
    })) as GithubCommit[],
    rateLimit: parseRateLimit(response)
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

export function findMatchingCommit({
  repo,
  text,
  commits
}: {
  repo: string;
  text: string;
  commits: GithubCommit[];
}) {
  const repoTokens = tokenize(repo.replace("/", " "));
  const tokens = Array.from(new Set([...tokenize(text), ...repoTokens]));
  let best: { score: number; matches: number; commit: GithubCommit } | null = null;

  for (const commit of commits) {
    const result = matchScore(tokens, commit.message);
    if (!best || result.score > best.score || (result.score === best.score && result.matches > best.matches)) {
      best = { ...result, commit };
    }
  }

  if (!best || best.score < 0.3 || best.matches < 2) {
    return null;
  }

  return best.commit;
}

function parseRateLimit(response: Response) {
  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));

  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) {
    return null;
  }

  return { remaining, reset };
}

function formatGithubApiError(prefix: string, status: number) {
  if (status === 401) {
    return `${prefix}: GitHub authorization expired. Reconnect GitHub.`;
  }
  if (status === 404) {
    return `${prefix}: repository or resource not found.`;
  }
  return `${prefix}: ${status}`;
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function matchScore(tokens: string[], message: string) {
  if (!tokens.length) {
    return { score: 0, matches: 0 };
  }

  const commitTokens = new Set(tokenize(message));
  const matches = tokens.filter((token) => commitTokens.has(token));
  return { score: matches.length / tokens.length, matches: matches.length };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}
