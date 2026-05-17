import { describe, expect, it } from "vitest";

import {
  assertGitHubOAuthState,
  buildGitHubOAuthAuthorizationUrl,
  getGitHubOAuthConfig,
  selectGitHubAuthToken,
} from "@/src/domain/github-oauth";

describe("github oauth helpers", () => {
  it("builds an authorization URL with repo scope and state", () => {
    const url = new URL(
      buildGitHubOAuthAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "https://app.example/api/github/oauth/callback",
        state: "state-123",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/github/oauth/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe("repo read:user");
  });

  it("accepts either explicit oauth env names or GitHub app env names", () => {
    expect(
      getGitHubOAuthConfig({
        GITHUB_CLIENT_ID: "client-id",
        GITHUB_CLIENT_SECRET: "client-secret",
      }),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });

  it("validates oauth state", () => {
    expect(
      assertGitHubOAuthState({
        expectedState: "abc",
        actualState: "abc",
      }),
    ).toBe("abc");
    expect(() =>
      assertGitHubOAuthState({
        expectedState: "abc",
        actualState: "xyz",
      }),
    ).toThrow("GitHub OAuth state did not match");
  });

  it("prefers request tokens before oauth cookie tokens", () => {
    expect(
      selectGitHubAuthToken({
        requestToken: "request-token",
        cookieToken: "cookie-token",
      }),
    ).toBe("request-token");
    expect(
      selectGitHubAuthToken({
        requestToken: " ",
        cookieToken: "cookie-token",
      }),
    ).toBe("cookie-token");
    expect(() => selectGitHubAuthToken({})).toThrow(
      "GitHub authentication is required",
    );
  });
});
