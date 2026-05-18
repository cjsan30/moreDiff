import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const clientId =
    process.env.GITHUB_OAUTH_CLIENT_ID?.trim() ??
    process.env.GITHUB_CLIENT_ID?.trim() ??
    "";
  const clientSecret =
    process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ??
    process.env.GITHUB_CLIENT_SECRET?.trim() ??
    "";

  return NextResponse.json({
    configured: Boolean(clientId && clientSecret),
    callbackUrl: new URL("/api/github/oauth/callback", requestUrl.origin)
      .toString(),
    requiredEnv: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
  });
}
