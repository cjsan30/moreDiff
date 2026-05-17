export const LIVE_COMPARE_STORAGE_KEY = "morediff.live-compare";

export interface LiveCompareLaunchState {
  sessionId?: string;
  token: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
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
    candidate.compareBranches.every((branch) => typeof branch === "string")
  );
}
