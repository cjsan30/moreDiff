import { NextResponse } from "next/server";

import { loadBranchFileContentFromGitHub } from "@/src/data/github-session-service";
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
    };

    const file = await loadBranchFileContentFromGitHub({
      token: body.token ?? "",
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      branch: body.branch ?? "",
      compareBranches: body.compareBranches ?? [],
      expectedHeadSha: body.expectedHeadSha ?? "",
      path: body.path ?? "",
    });

    return NextResponse.json({
      ok: true,
      content: file.content,
      contentSha: file.contentSha,
      headSha: file.headSha,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to load branch file",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
