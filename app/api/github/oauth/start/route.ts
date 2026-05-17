import { NextResponse } from "next/server";

import {
  GITHUB_OAUTH_STATE_COOKIE,
  buildGitHubOAuthAuthorizationUrl,
  getGitHubOAuthConfig,
} from "@/src/domain/github-oauth";

export async function GET(request: Request) {
  try {
    const config = getGitHubOAuthConfig();
    const requestUrl = new URL(request.url);
    const state = crypto.randomUUID();
    const redirectUri = new URL("/api/github/oauth/callback", requestUrl.origin)
      .toString();
    const response = NextResponse.redirect(
      buildGitHubOAuthAuthorizationUrl({
        clientId: config.clientId,
        redirectUri,
        state,
      }),
    );

    response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to start GitHub OAuth",
      },
      {
        status: 501,
      },
    );
  }
}
