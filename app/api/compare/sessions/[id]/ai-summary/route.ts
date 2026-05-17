import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { createAiReviewSummary } from "@/src/data/ai-summary-service";
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
    const exported = await exportCompareSessionSummaryForToken({
      token,
      sessionId: params.id,
    });
    const aiSummary = await createAiReviewSummary({
      markdown: exported.markdown,
    });

    return NextResponse.json({
      ...aiSummary,
      stats: exported.stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "failed to generate AI review summary",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
