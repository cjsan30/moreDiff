import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import {
  markCompareSessionOpenedForToken,
  readCompareSessionBundle,
} from "@/src/data/compare-session-store";
import { GitHubRequestError } from "@/src/github/client";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const { id } = await context.params;
    const token = await resolveGitHubRouteToken(
      request.headers.get("x-morediff-token"),
    );
    const bundle = await readCompareSessionBundle({
      token,
      sessionId: id,
    });
    await markCompareSessionOpenedForToken({
      token,
      sessionId: id,
    });

    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "저장된 세션을 불러오지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
