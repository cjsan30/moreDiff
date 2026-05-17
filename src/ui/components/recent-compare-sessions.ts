"use client";

export const RECENT_COMPARE_SESSIONS_STORAGE_KEY =
  "morediff.recent-compare-sessions";
const MAX_RECENT_COMPARE_SESSIONS = 8;

export interface RecentCompareSession {
  id: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads: Record<string, string>;
  savedAt: string;
  lastOpenedAt?: string;
}

export interface RecentCompareSessionInput {
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads?: Record<string, string>;
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
    (candidate.lastOpenedAt === undefined ||
      typeof candidate.lastOpenedAt === "string") &&
    (candidate.branchHeads === undefined ||
      isStringRecord(candidate.branchHeads)) &&
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

    return parsed.filter(isRecentCompareSession).map(normalizeRecentCompareSession);
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

export function mergeRecentCompareSessions(
  currentSessions: RecentCompareSession[],
  incomingSessions: RecentCompareSession[],
): RecentCompareSession[] {
  const byId = new Map<string, RecentCompareSession>();
  for (const session of [...currentSessions, ...incomingSessions]) {
    const existing = byId.get(session.id);
    byId.set(session.id, {
      ...(existing ?? session),
      ...session,
      branchHeads: {
        ...(existing?.branchHeads ?? {}),
        ...(session.branchHeads ?? {}),
      },
      savedAt: newestTimestamp(existing?.savedAt, session.savedAt),
      lastOpenedAt: newestTimestamp(existing?.lastOpenedAt, session.lastOpenedAt),
    });
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        new Date(right.lastOpenedAt ?? right.savedAt).getTime() -
        new Date(left.lastOpenedAt ?? left.savedAt).getTime(),
    )
    .slice(0, MAX_RECENT_COMPARE_SESSIONS);
}

export function upsertRecentCompareSession(
  currentSessions: RecentCompareSession[],
  session: RecentCompareSessionInput,
  options: {
    markOpened?: boolean;
    now?: string;
  } = {},
): RecentCompareSession[] {
  const id = createRecentCompareSessionId(session);
  const existing = currentSessions.find((entry) => entry.id === id);
  const now = options.now ?? new Date().toISOString();
  const nextEntry: RecentCompareSession = {
    id,
    repoUrl: session.repoUrl,
    baseBranch: session.baseBranch,
    compareBranches: [...session.compareBranches],
    branchHeads: {
      ...(existing?.branchHeads ?? {}),
      ...(session.branchHeads ?? {}),
    },
    savedAt: now,
    lastOpenedAt: options.markOpened ? now : existing?.lastOpenedAt,
  };

  return [
    nextEntry,
    ...currentSessions.filter((entry) => entry.id !== nextEntry.id),
  ].slice(0, MAX_RECENT_COMPARE_SESSIONS);
}

export function markRecentCompareSessionOpened(
  currentSessions: RecentCompareSession[],
  sessionId: string,
  now = new Date().toISOString(),
): RecentCompareSession[] {
  return currentSessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          lastOpenedAt: now,
        }
      : session,
  );
}

export function createRecentCompareSessionId(
  session: RecentCompareSessionInput,
): string {
  return JSON.stringify({
    repoUrl: session.repoUrl,
    baseBranch: session.baseBranch,
    compareBranches: [...session.compareBranches].sort(),
  });
}

function normalizeRecentCompareSession(
  session: RecentCompareSession,
): RecentCompareSession {
  return {
    ...session,
    branchHeads: session.branchHeads ?? {},
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function newestTimestamp(left?: string, right?: string): string {
  if (!left) {
    return right ?? "";
  }
  if (!right) {
    return left;
  }

  return new Date(left).getTime() > new Date(right).getTime() ? left : right;
}
