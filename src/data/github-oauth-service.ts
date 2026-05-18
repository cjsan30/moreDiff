import { GitHubClient } from "@/src/github/client";

interface GitHubOAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGitHubOAuthCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GitHubOAuthTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? "GitHub OAuth 토큰 교환에 실패했습니다",
    );
  }

  return payload.access_token;
}

export async function summarizeGitHubOAuthSession(token: string) {
  const client = new GitHubClient(token);
  const [viewer, repositories] = await Promise.all([
    client.getViewer(),
    client.listRepositories(),
  ]);

  return {
    authenticated: true,
    viewerLogin: viewer.login,
    repositories,
  };
}
