import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import {
  listCompareSessionsForToken,
  markCompareSessionOpenedForToken,
  saveCompareSessionForToken,
} from "@/src/data/compare-session-store";
import { GitHubRequestError } from "@/src/github/client";

export async function GET(request: Request) {
  try {
    const token = await resolveGitHubRouteToken(
      request.headers.get("x-morediff-token"),
    );
    const sessions = await listCompareSessionsForToken({ token });
    return NextResponse.json({
      sessions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sessions: [],
        error:
          error instanceof Error ? error.message : "failed to list saved sessions",
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
      baseBranch?: string;
      compareBranches?: string[];
      branchHeads?: Record<string, string>;
      markOpened?: boolean;
    };
    const token = await resolveGitHubRouteToken(body.token);
    const session = await saveCompareSessionForToken({
      token,
      repoUrl: body.repoUrl ?? "",
      baseBranch: body.baseBranch ?? "",
      compareBranches: body.compareBranches ?? [],
      branchHeads: body.branchHeads ?? {},
    });

    if (body.markOpened) {
      const openedSession = await markCompareSessionOpenedForToken({
        token,
        sessionId: session.id,
      });
      return NextResponse.json({
        session: openedSession,
      });
    }

    return NextResponse.json({
      session,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to save compare session",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
