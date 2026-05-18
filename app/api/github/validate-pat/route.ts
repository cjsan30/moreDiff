import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { validatePatConnection } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
    };

    const token = await resolveGitHubRouteToken(body.token);
    const connection = await validatePatConnection({
      token,
      repoUrl: body.repoUrl,
    });

    return NextResponse.json(connection);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GitHub 접근 권한 검증에 실패했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
