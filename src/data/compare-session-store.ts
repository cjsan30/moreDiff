import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCompareSessionRequest } from "@/src/domain/compare-session";
import { parseGitHubRepositoryUrl } from "@/src/domain/github-connection";
import type {
  CompareSessionBundle,
  CompareSessionRecord,
  FileDiffRecord,
  GitHubConnectionRecord,
  SavedCompareSessionSummary,
  SessionBranchRecord,
  UserRecord,
  WorkspaceEditRecord,
} from "@/src/domain/persistence-models";
import type { CompareSessionViewModel } from "@/src/domain/types";
import { GitHubClient } from "@/src/github/client";

interface PersistenceState {
  version: 1;
  users: UserRecord[];
  githubConnections: GitHubConnectionRecord[];
  compareSessions: CompareSessionRecord[];
  sessionBranches: SessionBranchRecord[];
  fileDiffs: FileDiffRecord[];
  workspaceEdits: WorkspaceEditRecord[];
  sessionOpenEvents: Array<{
    session_id: string;
    opened_at: string;
  }>;
}

export interface SaveCompareSessionInput {
  token: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads?: Record<string, string>;
  viewModel?: CompareSessionViewModel;
  accessTokenRef?: string;
  now?: string;
  storeFile?: string;
}

export function createEmptyPersistenceState(): PersistenceState {
  return {
    version: 1,
    users: [],
    githubConnections: [],
    compareSessions: [],
    sessionBranches: [],
    fileDiffs: [],
    workspaceEdits: [],
    sessionOpenEvents: [],
  };
}

export function createCompareSessionPersistenceId(input: {
  userId: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
}): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        userId: input.userId,
        repoUrl: input.repoUrl,
        baseBranch: input.baseBranch,
        compareBranches: [...input.compareBranches].sort(),
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return `session_${hash}`;
}

export async function saveCompareSessionForToken(
  input: SaveCompareSessionInput,
): Promise<SavedCompareSessionSummary> {
  validateCompareSessionRequest({
    baseBranch: input.baseBranch,
    compareBranches: input.compareBranches,
  });
  const viewer = await new GitHubClient(input.token).getViewer();
  const now = input.now ?? new Date().toISOString();
  const userId = `github:${viewer.id}`;
  const repository = parseGitHubRepositoryUrl(input.repoUrl);
  const state = await readPersistenceState(input.storeFile);
  const sessionId = createCompareSessionPersistenceId({
    userId,
    repoUrl: repository.url,
    baseBranch: input.baseBranch,
    compareBranches: input.compareBranches,
  });

  upsertUser(state, {
    id: userId,
    github_account_id: String(viewer.id),
    login: viewer.login,
    email: "",
    name: viewer.login,
    created_at: now,
    updated_at: now,
  });
  upsertGitHubConnection(state, {
    id: `github_connection_${stableHash(userId)}`,
    user_id: userId,
    github_account_id: String(viewer.id),
    github_login: viewer.login,
    access_token_ref: input.accessTokenRef ?? "request-or-cookie",
    created_at: now,
    updated_at: now,
  });
  upsertCompareSession(state, {
    id: sessionId,
    user_id: userId,
    repo_owner: repository.owner,
    repo_name: repository.name,
    repo_url: repository.url,
    base_branch: input.baseBranch,
    created_at: now,
    updated_at: now,
  });

  state.sessionBranches = state.sessionBranches.filter(
    (branch) => branch.session_id !== sessionId,
  );
  state.sessionBranches.push(
    ...input.compareBranches.map((branchName, index) => ({
      id: `${sessionId}:branch:${index}`,
      session_id: sessionId,
      branch_name: branchName,
      ordinal: index,
      head_sha: input.branchHeads?.[branchName] ?? "",
    })),
  );

  if (input.viewModel) {
    state.fileDiffs = state.fileDiffs.filter(
      (fileDiff) => fileDiff.session_id !== sessionId,
    );
    state.fileDiffs.push(...buildFileDiffRecords(sessionId, input.viewModel));
  }

  await writePersistenceState(state, input.storeFile);
  return summarizeSession(state, sessionId);
}

export async function markCompareSessionOpenedForToken(input: {
  token: string;
  sessionId: string;
  now?: string;
  storeFile?: string;
}): Promise<SavedCompareSessionSummary> {
  const viewer = await new GitHubClient(input.token).getViewer();
  const userId = `github:${viewer.id}`;
  const state = await readPersistenceState(input.storeFile);
  const session = state.compareSessions.find(
    (candidate) => candidate.id === input.sessionId && candidate.user_id === userId,
  );
  if (!session) {
    throw new Error("saved compare session was not found");
  }

  state.sessionOpenEvents = state.sessionOpenEvents.filter(
    (event) => event.session_id !== input.sessionId,
  );
  state.sessionOpenEvents.push({
    session_id: input.sessionId,
    opened_at: input.now ?? new Date().toISOString(),
  });
  await writePersistenceState(state, input.storeFile);
  return summarizeSession(state, input.sessionId);
}

export async function listCompareSessionsForToken(input: {
  token: string;
  storeFile?: string;
}): Promise<SavedCompareSessionSummary[]> {
  const viewer = await new GitHubClient(input.token).getViewer();
  const userId = `github:${viewer.id}`;
  const state = await readPersistenceState(input.storeFile);

  return state.compareSessions
    .filter((session) => session.user_id === userId)
    .map((session) => summarizeSession(state, session.id))
    .sort(
      (left, right) =>
        new Date(right.lastOpenedAt ?? right.savedAt).getTime() -
        new Date(left.lastOpenedAt ?? left.savedAt).getTime(),
    );
}

export async function readCompareSessionBundle(input: {
  token: string;
  sessionId: string;
  storeFile?: string;
}): Promise<CompareSessionBundle> {
  const viewer = await new GitHubClient(input.token).getViewer();
  const userId = `github:${viewer.id}`;
  const state = await readPersistenceState(input.storeFile);
  const session = state.compareSessions.find(
    (candidate) => candidate.id === input.sessionId && candidate.user_id === userId,
  );
  if (!session) {
    throw new Error("saved compare session was not found");
  }

  return {
    session,
    branches: state.sessionBranches.filter(
      (branch) => branch.session_id === session.id,
    ),
    fileDiffs: state.fileDiffs.filter((fileDiff) => fileDiff.session_id === session.id),
    workspaceEdits: state.workspaceEdits.filter(
      (edit) => edit.session_id === session.id,
    ),
  };
}

async function readPersistenceState(storeFile = getDefaultStoreFile()) {
  try {
    const text = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(text) as Partial<PersistenceState>;
    return {
      ...createEmptyPersistenceState(),
      ...parsed,
      version: 1 as const,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyPersistenceState();
    }

    throw error;
  }
}

async function writePersistenceState(
  state: PersistenceState,
  storeFile = getDefaultStoreFile(),
) {
  await mkdir(path.dirname(storeFile), {
    recursive: true,
  });
  await writeFile(storeFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getDefaultStoreFile() {
  return (
    process.env.MOREDIFF_STORE_FILE ??
    path.join(process.cwd(), "state", "app", "morediff-store.json")
  );
}

function upsertUser(state: PersistenceState, user: UserRecord) {
  const existing = state.users.find((candidate) => candidate.id === user.id);
  if (!existing) {
    state.users.push(user);
    return;
  }

  Object.assign(existing, {
    ...user,
    created_at: existing.created_at,
  });
}

function upsertGitHubConnection(
  state: PersistenceState,
  connection: GitHubConnectionRecord,
) {
  const existing = state.githubConnections.find(
    (candidate) => candidate.id === connection.id,
  );
  if (!existing) {
    state.githubConnections.push(connection);
    return;
  }

  Object.assign(existing, {
    ...connection,
    created_at: existing.created_at,
  });
}

function upsertCompareSession(
  state: PersistenceState,
  session: CompareSessionRecord,
) {
  const existing = state.compareSessions.find(
    (candidate) => candidate.id === session.id,
  );
  if (!existing) {
    state.compareSessions.push(session);
    return;
  }

  Object.assign(existing, {
    ...session,
    created_at: existing.created_at,
  });
}

function buildFileDiffRecords(
  sessionId: string,
  viewModel: CompareSessionViewModel,
): FileDiffRecord[] {
  return viewModel.branches.flatMap((branch) =>
    branch.files.map((file) => ({
      id: `${sessionId}:file:${stableHash(`${branch.name}:${file.path}`)}`,
      session_id: sessionId,
      branch_name: branch.name,
      file_path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
    })),
  );
}

function summarizeSession(
  state: PersistenceState,
  sessionId: string,
): SavedCompareSessionSummary {
  const session = state.compareSessions.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) {
    throw new Error("saved compare session was not found");
  }

  const branches = state.sessionBranches
    .filter((branch) => branch.session_id === sessionId)
    .sort((left, right) => left.ordinal - right.ordinal);
  const openedEvent = state.sessionOpenEvents.find(
    (event) => event.session_id === sessionId,
  );

  return {
    id: session.id,
    repoUrl: session.repo_url,
    baseBranch: session.base_branch,
    compareBranches: branches.map((branch) => branch.branch_name),
    branchHeads: Object.fromEntries(
      branches.map((branch) => [branch.branch_name, branch.head_sha]),
    ),
    savedAt: session.updated_at,
    lastOpenedAt: openedEvent?.opened_at,
  };
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
