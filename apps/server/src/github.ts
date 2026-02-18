import fetch from "node-fetch";

interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
}

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
    }
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
  const response = await fetch(
    `https://api.github.com/repos/${repo}/commits?sha=${branch}&per_page=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

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
  return { commits, rateLimit: { remaining, reset } };
}
