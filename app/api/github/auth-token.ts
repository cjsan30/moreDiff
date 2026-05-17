import { cookies } from "next/headers";

import {
  GITHUB_OAUTH_TOKEN_COOKIE,
  selectGitHubAuthToken,
} from "@/src/domain/github-oauth";

export async function resolveGitHubRouteToken(requestToken?: string | null) {
  const cookieStore = await cookies();
  return selectGitHubAuthToken({
    requestToken,
    cookieToken: cookieStore.get(GITHUB_OAUTH_TOKEN_COOKIE)?.value,
  });
}
