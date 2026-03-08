import { describe, expect, it, vi } from "vitest";
import {
  buildAccountRedirectUrl,
  buildCommitsRedirectUrl,
  finalizeAuthRedirectUrl,
  formatGithubConnectError,
  GITHUB_AUTH_SCOPES,
  hasGithubIdentity,
  startGithubConnect,
  startGithubReconnect
} from "../src/lib/githubAuth";

describe("github auth helpers", () => {
  it("builds a redirect back to the commits route", () => {
    const redirectTo = buildCommitsRedirectUrl({
      origin: "https://notes.jahrix.xyz",
      pathname: "/app",
      search: "?tab=current"
    });

    expect(redirectTo).toBe(
      "https://notes.jahrix.xyz/app?tab=current&auth_redirect=commits&auth_return_to=%2Fapp%3Ftab%3Dcurrent#commits"
    );
  });

  it("builds a redirect back to the account route", () => {
    const redirectTo = buildAccountRedirectUrl({
      origin: "https://notes.jahrix.xyz",
      pathname: "/app",
      search: "?tab=current"
    });

    expect(redirectTo).toBe(
      "https://notes.jahrix.xyz/app?tab=current&auth_redirect=account&auth_return_to=%2Fapp%3Ftab%3Dcurrent#account"
    );
  });

  it("uses Supabase identity linking for an existing app session", async () => {
    const linkIdentity = vi.fn().mockResolvedValue({ data: { provider: "github", url: "https://supabase.test" }, error: null });
    const signInWithOAuth = vi.fn();

    await startGithubConnect(
      { linkIdentity, signInWithOAuth },
      "https://notes.jahrix.xyz/#commits",
      {
        hasAppSession: true,
        hasLinkedGithubIdentity: false
      }
    );

    expect(linkIdentity).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://notes.jahrix.xyz/#commits",
        scopes: GITHUB_AUTH_SCOPES
      }
    });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("falls back to Supabase oauth sign-in when there is no current app session", async () => {
    const linkIdentity = vi.fn();
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: "github", url: "https://supabase.test" }, error: null });

    await startGithubConnect(
      { linkIdentity, signInWithOAuth },
      "https://notes.jahrix.xyz/#commits",
      {
        hasAppSession: false,
        hasLinkedGithubIdentity: false
      }
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://notes.jahrix.xyz/#commits",
        scopes: GITHUB_AUTH_SCOPES
      }
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("detects github as a linked provider from Supabase identities array", () => {
    expect(
      hasGithubIdentity({
        identities: [{ provider: "github", id: "123", user_id: "u1", identity_data: {}, created_at: "", updated_at: "", last_sign_in_at: "" }]
      })
    ).toBe(true);
  });

  it("returns false when identities is empty (legacy app_metadata is ignored)", () => {
    // app_metadata.providers is Supabase v1 only and is no longer used.
    expect(
      hasGithubIdentity({
        identities: []
      })
    ).toBe(false);
  });

  it("uses oauth reauthentication when github is already linked", async () => {
    const linkIdentity = vi.fn();
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: "github", url: "https://supabase.test" }, error: null });

    await startGithubConnect(
      { linkIdentity, signInWithOAuth },
      "https://notes.jahrix.xyz/#commits",
      {
        hasAppSession: true,
        hasLinkedGithubIdentity: true
      }
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://notes.jahrix.xyz/#commits",
        scopes: GITHUB_AUTH_SCOPES
      }
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("always uses oauth reauthentication for explicit reconnect", async () => {
    const linkIdentity = vi.fn();
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: "github", url: "https://supabase.test" }, error: null });

    await startGithubReconnect(
      { linkIdentity, signInWithOAuth },
      "https://notes.jahrix.xyz/app?auth_redirect=commits&auth_return_to=%2Fapp#commits"
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://notes.jahrix.xyz/app?auth_redirect=commits&auth_return_to=%2Fapp#commits",
        scopes: GITHUB_AUTH_SCOPES
      }
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("normalizes identity-already-exists into a reconnect message", () => {
    expect(formatGithubConnectError(new Error("identity_already_exists"))).toContain("already linked");
  });

  it("cleans auth tokens from the callback url and restores the commits route", () => {
    const cleanedUrl = finalizeAuthRedirectUrl({
      pathname: "/app",
      search: "?auth_redirect=commits&auth_return_to=%2Fapp%3Ftab%3Dcurrent",
      hash: "#access_token=test&refresh_token=refresh&provider_token=provider"
    });

    expect(cleanedUrl).toBe("/app?tab=current#commits");
  });

  it("cleans legacy auth errors back to the intended route", () => {
    const cleanedUrl = finalizeAuthRedirectUrl({
      pathname: "/auth/github/start",
      search: "?auth_redirect=commits&auth_return_to=%2Fapp&error=server_error&error_code=identity_already_exists",
      hash: ""
    });

    expect(cleanedUrl).toBe("/app#commits");
  });
});
