import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { saveCompareSessionForToken } from "@/src/data/compare-session-store";
import { buildCompareSessionFromGitHub } from "@/src/data/github-session-service";
import type { ImportedPullRequest } from "@/src/domain/types";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      baseBranch?: string;
      compareBranches?: string[];
      pullRequests?: ImportedPullRequest[];
    };

    const token = await resolveGitHubRouteToken(body.token);
    const session = await buildCompareSessionFromGitHub({
      token,
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      compareBranches: body.compareBranches ?? [],
    });
    await saveCompareSessionForToken({
      token,
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      compareBranches: body.compareBranches ?? [],
      branchHeads: Object.fromEntries(
        session.branches.map((branch) => [branch.name, branch.headSha]),
      ),
      viewModel: session,
      pullRequests: body.pullRequests,
    });

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "비교 세션을 만들지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
