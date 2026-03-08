import { describe, expect, it, vi } from "vitest";
import {
  buildCommitsRedirectUrl,
  formatGithubConnectError,
  GITHUB_AUTH_SCOPES,
  hasGithubIdentity,
  startGithubConnect
} from "../src/lib/githubAuth";

describe("github auth helpers", () => {
  it("builds a redirect back to the commits route", () => {
    const redirectTo = buildCommitsRedirectUrl({
      origin: "https://notes.jahrix.xyz",
      pathname: "/app",
      search: "?tab=current"
    });

    expect(redirectTo).toBe("https://notes.jahrix.xyz/app?tab=current#commits");
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

  it("detects github as a linked provider from Supabase user metadata", () => {
    expect(
      hasGithubIdentity({
        app_metadata: { providers: ["email", "github"] },
        identities: []
      })
    ).toBe(true);
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

  it("normalizes identity-already-exists into a reconnect message", () => {
    expect(formatGithubConnectError(new Error("identity_already_exists"))).toContain("already linked");
  });
});
