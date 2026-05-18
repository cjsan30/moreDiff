import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { loadBranchFileContentFromGitHub } from "@/src/data/github-session-service";
import type { FileStatus } from "@/src/domain/types";
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
      path?: string;
      basePath?: string;
      status?: FileStatus;
    };

    const token = await resolveGitHubRouteToken(body.token);
    const file = await loadBranchFileContentFromGitHub({
      token,
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      branch: body.branch ?? "",
      compareBranches: body.compareBranches ?? [],
      expectedHeadSha: body.expectedHeadSha ?? "",
      path: body.path ?? "",
      basePath: body.basePath,
      status: body.status,
    });

    return NextResponse.json({
      ok: true,
      content: file.content,
      contentSha: file.contentSha,
      baseContent: file.baseContent,
      baseContentSha: file.baseContentSha,
      headSha: file.headSha,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "브랜치 파일을 불러오지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
