import { NextResponse } from "next/server";

import { saveBranchFileToGitHub } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      branch?: string;
      path?: string;
      content?: string;
      message?: string;
    };

    await saveBranchFileToGitHub({
      token: body.token ?? "",
      repoUrl: body.repoUrl ?? "",
      branch: body.branch ?? "",
      path: body.path ?? "",
      content: body.content ?? "",
      message: body.message ?? "Update file from MoreDiff",
    });

    return NextResponse.json({
      ok: true,
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
