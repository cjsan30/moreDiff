export const LIVE_COMPARE_STORAGE_KEY = "morediff.live-compare";

export interface LiveCompareLaunchState {
  sessionId?: string;
  token: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  pullRequests?: Array<{
    number: number;
    title: string;
    url: string;
    baseBranch: string;
    headBranch: string;
    headSha: string;
    isSameRepository: boolean;
    updatedAt: string;
    authorLogin: string;
  }>;
}

export function isLiveCompareLaunchState(
  value: unknown,
): value is LiveCompareLaunchState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<LiveCompareLaunchState>;
  return (
    (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
    typeof candidate.token === "string" &&
    typeof candidate.repoUrl === "string" &&
    typeof candidate.baseBranch === "string" &&
    Array.isArray(candidate.compareBranches) &&
    candidate.compareBranches.every((branch) => typeof branch === "string") &&
    (candidate.pullRequests === undefined ||
      (Array.isArray(candidate.pullRequests) &&
        candidate.pullRequests.every(isLaunchPullRequest)))
  );
}

function isLaunchPullRequest(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<
    NonNullable<LiveCompareLaunchState["pullRequests"]>[number]
  >;
  return (
    typeof candidate.number === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.baseBranch === "string" &&
    typeof candidate.headBranch === "string" &&
    typeof candidate.headSha === "string" &&
    typeof candidate.isSameRepository === "boolean" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.authorLogin === "string"
  );
}
