import { NextResponse } from "next/server";

import { exchangeGitHubOAuthCode } from "@/src/data/github-oauth-service";
import {
  GITHUB_OAUTH_STATE_COOKIE,
  GITHUB_OAUTH_TOKEN_COOKIE,
  assertGitHubOAuthState,
  getGitHubOAuthConfig,
} from "@/src/domain/github-oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectToConnect = new URL("/connect", requestUrl.origin);

  try {
    const code = requestUrl.searchParams.get("code")?.trim() ?? "";
    if (!code) {
      throw new Error("GitHub OAuth callback did not include a code");
    }

    const expectedState = request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${GITHUB_OAUTH_STATE_COOKIE}=`))
      ?.split("=")[1];
    assertGitHubOAuthState({
      expectedState,
      actualState: requestUrl.searchParams.get("state"),
    });

    const config = getGitHubOAuthConfig();
    const redirectUri = new URL("/api/github/oauth/callback", requestUrl.origin)
      .toString();
    const token = await exchangeGitHubOAuthCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
    });

    redirectToConnect.searchParams.set("auth", "github");
    const response = NextResponse.redirect(redirectToConnect);
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    response.cookies.set(GITHUB_OAUTH_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch (error) {
    redirectToConnect.searchParams.set("auth", "error");
    redirectToConnect.searchParams.set(
      "message",
      error instanceof Error ? error.message : "GitHub OAuth failed",
    );
    const response = NextResponse.redirect(redirectToConnect);
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    return response;
  }
}
