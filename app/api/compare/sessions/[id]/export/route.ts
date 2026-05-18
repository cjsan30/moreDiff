import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { exportCompareSessionSummaryForToken } from "@/src/data/compare-session-store";
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
    const params = await context.params;
    const token = await resolveGitHubRouteToken(
      request.headers.get("x-morediff-token"),
    );
    const summary = await exportCompareSessionSummaryForToken({
      token,
      sessionId: params.id,
    });

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "비교 세션을 내보내지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
