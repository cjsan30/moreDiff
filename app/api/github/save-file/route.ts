import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { recordWorkspaceEditForToken } from "@/src/data/compare-session-store";
import { saveBranchFileToGitHub } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      baseBranch?: string;
      branch?: string;
      compareBranches?: string[];
      expectedHeadSha?: string;
      sessionId?: string;
      path?: string;
      content?: string;
      message?: string;
    };

    const token = await resolveGitHubRouteToken(body.token);
    const savedFile = await saveBranchFileToGitHub({
      token,
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      branch: body.branch ?? "",
      compareBranches: body.compareBranches ?? [],
      expectedHeadSha: body.expectedHeadSha ?? "",
      path: body.path ?? "",
      content: body.content ?? "",
      message: body.message ?? "Update file from MoreDiff",
    });

    if (body.sessionId) {
      try {
        await recordWorkspaceEditForToken({
          token,
          sessionId: body.sessionId,
          branchName: body.branch ?? "",
          filePath: body.path ?? "",
          originalSha: body.expectedHeadSha ?? "",
          editedContent: body.content ?? "",
        });
      } catch {
        // GitHub writeback succeeded; persistence audit must not turn it into a failed save.
      }
    }

    return NextResponse.json({
      ok: true,
      headSha: savedFile.headSha,
      contentSha: savedFile.contentSha,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "failed to save branch file",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
