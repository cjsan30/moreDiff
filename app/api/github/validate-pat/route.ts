import { NextResponse } from "next/server";

import { validatePatConnection } from "@/src/data/github-session-service";
import { GitHubRequestError } from "@/src/github/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      repoUrl?: string;
    };

    const connection = await validatePatConnection({
      token: body.token ?? "",
      repoUrl: body.repoUrl ?? "",
    });

    return NextResponse.json(connection);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "failed to validate PAT",
      },
      {
        status: error instanceof GitHubRequestError ? error.status : 400,
      },
    );
  }
}
