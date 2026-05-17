import { NextResponse } from "next/server";

import { summarizeGitHubOAuthSession } from "@/src/data/github-oauth-service";
import { GITHUB_OAUTH_TOKEN_COOKIE } from "@/src/domain/github-oauth";
import { GitHubRequestError } from "@/src/github/client";
import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";

export async function GET() {
  try {
    const token = await resolveGitHubRouteToken("");
    const session = await summarizeGitHubOAuthSession(token);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        error:
          error instanceof Error ? error.message : "GitHub OAuth session unavailable",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 200,
      },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    ok: true,
  });
  response.cookies.delete(GITHUB_OAUTH_TOKEN_COOKIE);
  return response;
}
