import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import {
  createPullRequestOnGitHub,
  listPullRequestsFromGitHub,
} from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const repoUrl = url.searchParams.get("repoUrl") ?? "";
    const token = await resolveGitHubRouteToken(
      request.headers.get("x-morediff-token"),
    );
    const pullRequests = await listPullRequestsFromGitHub({
      token,
      repoUrl,
    });

    return NextResponse.json({
      pullRequests,
    });
  } catch (error) {
    return NextResponse.json(
      {
        pullRequests: [],
        error:
          error instanceof Error ? error.message : "풀 리퀘스트 목록을 불러오지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
      title?: string;
      body?: string;
      baseBranch?: string;
      headBranch?: string;
      draft?: boolean;
    };
    const token = await resolveGitHubRouteToken(body.token);
    const pullRequest = await createPullRequestOnGitHub({
      token,
      repoUrl: body.repoUrl ?? "",
      title: body.title ?? "",
      body: body.body,
      baseBranch: body.baseBranch ?? "",
      headBranch: body.headBranch ?? "",
      draft: body.draft,
    });

    return NextResponse.json({
      pullRequest,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "풀 리퀘스트를 생성하지 못했습니다",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
