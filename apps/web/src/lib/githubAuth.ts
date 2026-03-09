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
const AUTH_REDIRECT_PARAM = "auth_redirect";
const AUTH_RETURN_TO_PARAM = "auth_return_to";
const AUTH_RESPONSE_PARAMS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "code",
  "error",
  "error_code",
  "error_description"
];
const AUTH_REDIRECT_TARGETS = new Set(["commits", "account"]);

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

type GithubConnectContext = {
  hasAppSession: boolean;
  hasLinkedGithubIdentity: boolean;
};

export function buildCommitsRedirectUrl(locationLike: {
  origin: string;
  pathname: string;
  search: string;
}) {
  return buildAuthRedirectUrl(locationLike, "commits");
}

export function buildAccountRedirectUrl(locationLike: {
  origin: string;
  pathname: string;
  search: string;
}) {
  return buildAuthRedirectUrl(locationLike, "account");
}

export function hasGithubIdentity(user: Pick<User, "identities"> | null | undefined) {
  if (!user) {
    return false;
  }
  return user.identities?.some((identity) => identity.provider === "github") ?? false;
}

export function hasGoogleIdentity(user: Pick<User, "identities"> | null | undefined) {
  if (!user) {
    return false;
  }
  return user.identities?.some((identity) => identity.provider === "google") ?? false;
}

export function getGithubIdentity(user: Pick<User, "identities"> | null | undefined): UserIdentity | null {
  return user?.identities?.find((identity) => identity.provider === "github") ?? null;
}

export function getGithubIdentityProfile(
  user: Pick<User, "identities"> | null | undefined
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
  context: GithubConnectContext
) {
  const options = {
    provider: "github" as const,
    options: {
      redirectTo,
      scopes: GITHUB_AUTH_SCOPES
    }
  };

  if (context.hasAppSession && !context.hasLinkedGithubIdentity) {
    return auth.linkIdentity(options);
  }

  return auth.signInWithOAuth(options);
}

export async function startGithubReconnect(auth: GithubAuthClient, redirectTo: string) {
  return auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo,
      scopes: GITHUB_AUTH_SCOPES
    }
  });
}

export function formatGithubConnectError(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to connect GitHub.";

  if (message.includes("identity_already_exists")) {
    return "GitHub is already linked to this account. Use Reconnect to refresh access.";
  }

  if (message.includes("manual linking")) {
    return "GitHub linking is disabled in Supabase. Enable manual identity linking in Auth settings.";
  }

  return message;
}

export function getGithubProviderToken(session: Pick<Session, "provider_token"> | null | undefined) {
  return session?.provider_token ?? null;
}

export function finalizeAuthRedirectUrl(locationLike: {
  pathname: string;
  search: string;
  hash: string;
}) {
  const searchParams = new URLSearchParams(locationLike.search);
  const { routeFromHash, hashParams } = parseHashFragment(locationLike.hash);
  const hasAuthResponse =
    AUTH_RESPONSE_PARAMS.some((param) => searchParams.has(param) || hashParams.has(param));

  if (!hasAuthResponse && !searchParams.has(AUTH_REDIRECT_PARAM)) {
    return null;
  }

  const redirectTarget = normalizeAuthRedirectTarget(searchParams.get(AUTH_REDIRECT_PARAM));
  const returnTo = normalizeReturnTo(searchParams.get(AUTH_RETURN_TO_PARAM));
  const route = redirectTarget ?? routeFromHash;

  searchParams.delete(AUTH_REDIRECT_PARAM);
  searchParams.delete(AUTH_RETURN_TO_PARAM);
  for (const param of AUTH_RESPONSE_PARAMS) {
    searchParams.delete(param);
  }

  const baseUrl = returnTo ? new URL(`https://linkra.local${returnTo}`) : null;
  const nextPathname = baseUrl?.pathname ?? locationLike.pathname;
  const nextSearch = baseUrl?.search ? baseUrl.search.slice(1) : searchParams.toString();
  const nextHash = route ? `#${route}` : "";
  return `${nextPathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
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

function buildAuthRedirectUrl(
  locationLike: { origin: string; pathname: string; search: string },
  target: "commits" | "account"
) {
  const url = new URL(`${locationLike.origin}${locationLike.pathname}${locationLike.search}`);
  url.searchParams.set(AUTH_REDIRECT_PARAM, target);
  url.searchParams.set(AUTH_RETURN_TO_PARAM, `${locationLike.pathname}${locationLike.search}`);
  url.hash = target;
  return url.toString();
}

function parseHashFragment(hash: string) {
  const trimmed = hash.replace(/^#/, "");
  if (!trimmed) {
    return { routeFromHash: null, hashParams: new URLSearchParams() };
  }

  if (looksLikeAuthPayload(trimmed)) {
    return { routeFromHash: null, hashParams: new URLSearchParams(trimmed) };
  }

  const [routeCandidate, hashQuery = ""] = trimmed.split("?");
  return {
    routeFromHash: normalizeAuthRedirectTarget(routeCandidate),
    hashParams: new URLSearchParams(hashQuery)
  };
}

function looksLikeAuthPayload(value: string) {
  const params = new URLSearchParams(value);
  return AUTH_RESPONSE_PARAMS.some((param) => params.has(param));
}

function normalizeAuthRedirectTarget(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  return AUTH_REDIRECT_TARGETS.has(normalized) ? normalized : null;
}

function normalizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("#")) {
    return null;
  }
  return value;
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
