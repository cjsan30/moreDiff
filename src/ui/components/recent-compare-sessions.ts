"use client";

import type { ImportedPullRequest } from "@/src/domain/types";

export const RECENT_COMPARE_SESSIONS_STORAGE_KEY =
  "morediff.recent-compare-sessions";
const MAX_RECENT_COMPARE_SESSIONS = 8;

export interface RecentCompareSession {
  id: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads: Record<string, string>;
  pullRequests: ImportedPullRequest[];
  savedAt: string;
  lastOpenedAt?: string;
}

export interface RecentCompareSessionInput {
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads?: Record<string, string>;
  pullRequests?: ImportedPullRequest[];
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
    (candidate.pullRequests === undefined ||
      (Array.isArray(candidate.pullRequests) &&
        candidate.pullRequests.every(isImportedPullRequest))) &&
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
      pullRequests: mergePullRequests(
        existing?.pullRequests ?? [],
        session.pullRequests ?? [],
      ),
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
  const existing = currentSessions.find(
    (entry) => entry.id === id || hasSameSessionShape(entry, session),
  );
  const now = options.now ?? new Date().toISOString();
  const nextEntry: RecentCompareSession = {
    id: existing?.id ?? id,
    repoUrl: session.repoUrl,
    baseBranch: session.baseBranch,
    compareBranches: [...session.compareBranches],
    branchHeads: {
      ...(existing?.branchHeads ?? {}),
      ...(session.branchHeads ?? {}),
    },
    pullRequests: mergePullRequests(
      existing?.pullRequests ?? [],
      session.pullRequests ?? [],
    ),
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
    pullRequests: session.pullRequests ?? [],
  };
}

function hasSameSessionShape(
  left: RecentCompareSession,
  right: RecentCompareSessionInput,
) {
  return (
    left.repoUrl === right.repoUrl &&
    left.baseBranch === right.baseBranch &&
    sortedBranchesKey(left.compareBranches) ===
      sortedBranchesKey(right.compareBranches)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isImportedPullRequest(value: unknown): value is ImportedPullRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ImportedPullRequest>;
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

function mergePullRequests(
  currentPullRequests: ImportedPullRequest[],
  incomingPullRequests: ImportedPullRequest[],
) {
  const byNumber = new Map<number, ImportedPullRequest>();
  for (const pullRequest of [...currentPullRequests, ...incomingPullRequests]) {
    byNumber.set(pullRequest.number, pullRequest);
  }

  return [...byNumber.values()].sort((left, right) => left.number - right.number);
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

function sortedBranchesKey(branches: string[]) {
  return [...branches].sort().join("\n");
}
