import { NextResponse } from "next/server";

import { buildCompareSessionFromGitHub } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      baseBranch?: string;
      compareBranches?: string[];
    };

    const session = await buildCompareSessionFromGitHub({
      token: body.token ?? "",
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      compareBranches: body.compareBranches ?? [],
    });

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to build compare session",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
