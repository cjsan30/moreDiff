export const GITHUB_OAUTH_STATE_COOKIE = "morediff.github_oauth_state";
export const GITHUB_OAUTH_TOKEN_COOKIE = "morediff.github_oauth_token";
export const GITHUB_OAUTH_SCOPES = "repo read:user";

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export function getGitHubOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): GitHubOAuthConfig {
  const clientId =
    env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? env.GITHUB_CLIENT_ID?.trim() ?? "";
  const clientSecret =
    env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ??
    env.GITHUB_CLIENT_SECRET?.trim() ??
    "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth가 설정되지 않았습니다. GITHUB_OAUTH_CLIENT_ID와 GITHUB_OAUTH_CLIENT_SECRET을 설정하세요",
    );
  }

  return {
    clientId,
    clientSecret,
  };
}

export function buildGitHubOAuthAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scope ?? GITHUB_OAUTH_SCOPES);
  return url.toString();
}

export function assertGitHubOAuthState(input: {
  expectedState?: string;
  actualState?: string | null;
}): string {
  const expectedState = input.expectedState?.trim() ?? "";
  const actualState = input.actualState?.trim() ?? "";

  if (!expectedState || !actualState || expectedState !== actualState) {
    throw new Error("GitHub OAuth state가 일치하지 않습니다");
  }

  return actualState;
}

export function selectGitHubAuthToken(input: {
  requestToken?: string | null;
  cookieToken?: string | null;
}): string {
  const requestToken = input.requestToken?.trim() ?? "";
  if (requestToken) {
    return requestToken;
  }

  const cookieToken = input.cookieToken?.trim() ?? "";
  if (cookieToken) {
    return cookieToken;
  }

  throw new Error("GitHub 인증이 필요합니다. 로그인하거나 PAT를 입력하세요");
}
