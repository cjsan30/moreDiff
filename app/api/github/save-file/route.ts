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
      message: body.message ?? "MoreDiff에서 파일 업데이트",
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
        // GitHub 쓰기는 성공했으므로 저장 감사 실패가 파일 저장 실패로 전파되면 안 됩니다.
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
        error: error instanceof Error ? error.message : "브랜치 파일을 저장하지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
