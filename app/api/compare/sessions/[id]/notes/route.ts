import { NextResponse } from "next/server";

import { resolveGitHubRouteToken } from "@/app/api/github/auth-token";
import {
  listReviewNotesForToken,
  saveReviewNoteForToken,
} from "@/src/data/compare-session-store";
import type { ReviewNote } from "@/src/domain/types";
import { GitHubRequestError } from "@/src/github/client";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const token = await resolveGitHubRouteToken(
      request.headers.get("x-morediff-token"),
    );
    const notes = await listReviewNotesForToken({
      token,
      sessionId: params.id,
    });

    return NextResponse.json({
      notes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        notes: [],
        error:
          error instanceof Error ? error.message : "failed to list review notes",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const body = (await request.json()) as {
      token?: string;
      branchName?: string;
      filePath?: string;
      lineNumber?: number;
      body?: string;
      status?: ReviewNote["status"];
    };
    const token = await resolveGitHubRouteToken(body.token);
    const note = await saveReviewNoteForToken({
      token,
      sessionId: params.id,
      branchName: body.branchName ?? "",
      filePath: body.filePath ?? "",
      lineNumber: body.lineNumber,
      body: body.body ?? "",
      status: body.status,
    });

    return NextResponse.json({
      note,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "failed to save review note",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
