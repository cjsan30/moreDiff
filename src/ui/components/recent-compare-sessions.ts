"use client";

export const RECENT_COMPARE_SESSIONS_STORAGE_KEY =
  "morediff.recent-compare-sessions";
const MAX_RECENT_COMPARE_SESSIONS = 8;

export interface RecentCompareSession {
  id: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  savedAt: string;
}

export function isRecentCompareSession(
  value: unknown,
): value is RecentCompareSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RecentCompareSession>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.repoUrl === "string" &&
    typeof candidate.baseBranch === "string" &&
    typeof candidate.savedAt === "string" &&
    Array.isArray(candidate.compareBranches) &&
    candidate.compareBranches.every((branch) => typeof branch === "string")
  );
}

export function readRecentCompareSessions(): RecentCompareSession[] {
  const stored = window.localStorage.getItem(
    RECENT_COMPARE_SESSIONS_STORAGE_KEY,
  );

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentCompareSession);
  } catch {
    return [];
  }
}

export function writeRecentCompareSessions(
  sessions: RecentCompareSession[],
): void {
  window.localStorage.setItem(
    RECENT_COMPARE_SESSIONS_STORAGE_KEY,
    JSON.stringify(sessions),
  );
}

export function upsertRecentCompareSession(
  currentSessions: RecentCompareSession[],
  session: Omit<RecentCompareSession, "id" | "savedAt">,
): RecentCompareSession[] {
  const nextEntry: RecentCompareSession = {
    id: createRecentCompareSessionId(session),
    repoUrl: session.repoUrl,
    baseBranch: session.baseBranch,
    compareBranches: [...session.compareBranches],
    savedAt: new Date().toISOString(),
  };

  return [
    nextEntry,
    ...currentSessions.filter((entry) => entry.id !== nextEntry.id),
  ].slice(0, MAX_RECENT_COMPARE_SESSIONS);
}

function createRecentCompareSessionId(
  session: Omit<RecentCompareSession, "id" | "savedAt">,
): string {
  return JSON.stringify({
    repoUrl: session.repoUrl,
    baseBranch: session.baseBranch,
    compareBranches: [...session.compareBranches].sort(),
  });
}
