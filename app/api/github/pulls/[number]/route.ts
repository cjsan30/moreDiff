import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import { updatePullRequestOnGitHub } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      number: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      title?: string;
      body?: string;
      baseBranch?: string;
      state?: "open" | "closed";
    };
    const token = await resolveGitHubRouteToken(body.token);
    const pullRequest = await updatePullRequestOnGitHub({
      token,
      repoUrl: body.repoUrl ?? "",
      pullNumber: Number.parseInt(params.number, 10),
      title: body.title,
      body: body.body,
      baseBranch: body.baseBranch,
      state: body.state,
    });

    return NextResponse.json({
      pullRequest,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to update pull request",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
