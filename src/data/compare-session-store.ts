import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCompareSessionRequest } from "@/src/domain/compare-session";
import { parseGitHubRepositoryUrl } from "@/src/domain/github-connection";
import type {
  AuditEventRecord,
  CompareSessionBundle,
  CompareSessionRecord,
  FileDiffRecord,
  GitHubConnectionRecord,
  PullRequestImportRecord,
  ReviewNoteRecord,
  SavedCompareSessionSummary,
  SessionBranchRecord,
  UserRecord,
  WorkspaceEditRecord,
} from "@/src/domain/persistence-models";
import type {
  CompareSessionViewModel,
  ImportedPullRequest,
  ReviewNote,
} from "@/src/domain/types";
import { GitHubClient } from "@/src/github/client";

interface PersistenceState {
  version: 1;
  users: UserRecord[];
  githubConnections: GitHubConnectionRecord[];
  compareSessions: CompareSessionRecord[];
  sessionBranches: SessionBranchRecord[];
  fileDiffs: FileDiffRecord[];
  workspaceEdits: WorkspaceEditRecord[];
  pullRequestImports: PullRequestImportRecord[];
  reviewNotes: ReviewNoteRecord[];
  auditEvents: AuditEventRecord[];
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
  pullRequests?: ImportedPullRequest[];
  accessTokenRef?: string;
  now?: string;
  storeFile?: string;
}

export interface SaveReviewNoteInput {
  token: string;
  sessionId: string;
  branchName: string;
  filePath: string;
  lineNumber?: number;
  body: string;
  status?: ReviewNote["status"];
  now?: string;
  storeFile?: string;
}

export interface RecordWorkspaceEditInput {
  token: string;
  sessionId: string;
  branchName: string;
  filePath: string;
  originalSha: string;
  editedContent: string;
  now?: string;
  storeFile?: string;
}

export interface ExportCompareSessionSummary {
  filename: string;
  markdown: string;
  stats: {
    branches: number;
    files: number;
    overlapFiles: number;
    notes: number;
    pullRequests: number;
  };
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
    pullRequestImports: [],
    reviewNotes: [],
    auditEvents: [],
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
    status: "active",
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
    appendAuditEvent(state, {
      userId,
      sessionId,
      eventType: "diff.loaded",
      entityType: "diff",
      entityId: sessionId,
      metadata: {
        files: input.viewModel.fileMatrix.length,
        branches: input.viewModel.branches.length,
      },
      now,
    });
  }

  if (input.pullRequests) {
    state.pullRequestImports = state.pullRequestImports.filter(
      (pullRequest) => pullRequest.session_id !== sessionId,
    );
    state.pullRequestImports.push(
      ...input.pullRequests.map((pullRequest) => ({
        ...pullRequest,
        id: `${sessionId}:pr:${pullRequest.number}`,
        session_id: sessionId,
        imported_at: now,
      })),
    );
  }

  appendAuditEvent(state, {
    userId,
    sessionId,
    eventType: "session.saved",
    entityType: "session",
    entityId: sessionId,
    metadata: {
      baseBranch: input.baseBranch,
      compareBranches: input.compareBranches.length,
    },
    now,
  });

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
  appendAuditEvent(state, {
    userId,
    sessionId: input.sessionId,
    eventType: "session.opened",
    entityType: "session",
    entityId: input.sessionId,
    metadata: {},
    now: input.now ?? new Date().toISOString(),
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
    pullRequests: state.pullRequestImports.filter(
      (pullRequest) => pullRequest.session_id === session.id,
    ),
    reviewNotes: state.reviewNotes.filter((note) => note.sessionId === session.id),
    auditEvents: state.auditEvents.filter(
      (event) => event.session_id === session.id,
    ),
  };
}

export async function listReviewNotesForToken(input: {
  token: string;
  sessionId: string;
  storeFile?: string;
}): Promise<ReviewNote[]> {
  const { state, session, userId } = await readOwnedSessionState(input);

  return state.reviewNotes
    .filter((note) => note.sessionId === session.id && note.user_id === userId)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .map(stripReviewNoteUser);
}

export async function saveReviewNoteForToken(
  input: SaveReviewNoteInput,
): Promise<ReviewNote> {
  const body = input.body.trim();
  if (!body) {
    throw new Error("review note body is required");
  }

  const { state, session, userId } = await readOwnedSessionState(input);
  const now = input.now ?? new Date().toISOString();
  const lineNumber =
    typeof input.lineNumber === "number" && Number.isFinite(input.lineNumber)
      ? Math.max(1, Math.trunc(input.lineNumber))
      : undefined;
  const noteId = `review_note_${stableHash(
    `${session.id}:${input.branchName}:${input.filePath}:${lineNumber ?? "file"}`,
  )}`;
  const existing = state.reviewNotes.find((note) => note.id === noteId);
  const note: ReviewNoteRecord = {
    id: noteId,
    user_id: userId,
    sessionId: session.id,
    branchName: input.branchName,
    filePath: input.filePath,
    lineNumber,
    body,
    status: input.status ?? existing?.status ?? "open",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    Object.assign(existing, note);
  } else {
    state.reviewNotes.push(note);
  }

  appendAuditEvent(state, {
    userId,
    sessionId: session.id,
    eventType:
      note.status === "resolved" ? "review_note.resolved" : "review_note.saved",
    entityType: "review_note",
    entityId: note.id,
    metadata: {
      branchName: note.branchName,
      filePath: note.filePath,
      status: note.status,
    },
    now,
  });

  await writePersistenceState(state, input.storeFile);
  return stripReviewNoteUser(note);
}

export async function recordWorkspaceEditForToken(
  input: RecordWorkspaceEditInput,
): Promise<WorkspaceEditRecord> {
  const { state, session, userId } = await readOwnedSessionState(input);
  const now = input.now ?? new Date().toISOString();
  const editId = `${session.id}:edit:${stableHash(
    `${input.branchName}:${input.filePath}`,
  )}`;
  const existing = state.workspaceEdits.find((edit) => edit.id === editId);
  const edit: WorkspaceEditRecord = {
    id: editId,
    session_id: session.id,
    branch_name: input.branchName,
    file_path: input.filePath,
    original_sha: input.originalSha,
    edited_content: input.editedContent,
    saved_at: now,
  };

  if (existing) {
    Object.assign(existing, edit);
  } else {
    state.workspaceEdits.push(edit);
  }

  appendAuditEvent(state, {
    userId,
    sessionId: session.id,
    eventType: "workspace_edit.saved",
    entityType: "workspace_edit",
    entityId: edit.id,
    metadata: {
      branchName: input.branchName,
      filePath: input.filePath,
    },
    now,
  });

  await writePersistenceState(state, input.storeFile);
  return edit;
}

export async function exportCompareSessionSummaryForToken(input: {
  token: string;
  sessionId: string;
  now?: string;
  storeFile?: string;
}): Promise<ExportCompareSessionSummary> {
  const { state, session, userId } = await readOwnedSessionState(input);
  const bundle = await readCompareSessionBundle(input);
  const now = input.now ?? new Date().toISOString();
  const overlapFiles = countOverlapFiles(bundle.fileDiffs);
  const markdown = buildExportMarkdown(bundle, overlapFiles);

  appendAuditEvent(state, {
    userId,
    sessionId: session.id,
    eventType: "summary.exported",
    entityType: "summary",
    entityId: session.id,
    metadata: {
      files: bundle.fileDiffs.length,
      notes: bundle.reviewNotes.length,
    },
    now,
  });
  await writePersistenceState(state, input.storeFile);

  return {
    filename: `morediff-${session.repo_owner}-${session.repo_name}-${session.id}.md`,
    markdown,
    stats: {
      branches: bundle.branches.length,
      files: new Set(bundle.fileDiffs.map((fileDiff) => fileDiff.file_path)).size,
      overlapFiles,
      notes: bundle.reviewNotes.length,
      pullRequests: bundle.pullRequests.length,
    },
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

async function readOwnedSessionState(input: {
  token: string;
  sessionId: string;
  storeFile?: string;
}) {
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
    state,
    session,
    userId,
  };
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
    pullRequests: state.pullRequestImports
      .filter((pullRequest) => pullRequest.session_id === sessionId)
      .sort((left, right) => left.number - right.number)
      .map(({ id: _id, session_id: _sessionId, imported_at: _importedAt, ...pullRequest }) => pullRequest),
    savedAt: session.updated_at,
    lastOpenedAt: openedEvent?.opened_at,
  };
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function appendAuditEvent(
  state: PersistenceState,
  input: {
    userId: string;
    sessionId: string;
    eventType: AuditEventRecord["event_type"];
    entityType: AuditEventRecord["entity_type"];
    entityId: string;
    metadata: AuditEventRecord["metadata"];
    now: string;
  },
) {
  state.auditEvents.push({
    id: `audit_${stableHash(
      `${input.sessionId}:${input.eventType}:${input.entityId}:${input.now}:${state.auditEvents.length}`,
    )}`,
    user_id: input.userId,
    session_id: input.sessionId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata,
    created_at: input.now,
  });
}

function stripReviewNoteUser(note: ReviewNoteRecord): ReviewNote {
  return {
    id: note.id,
    sessionId: note.sessionId,
    branchName: note.branchName,
    filePath: note.filePath,
    lineNumber: note.lineNumber,
    body: note.body,
    status: note.status,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function countOverlapFiles(fileDiffs: FileDiffRecord[]) {
  const branchesByPath = new Map<string, Set<string>>();
  for (const fileDiff of fileDiffs) {
    const branches = branchesByPath.get(fileDiff.file_path) ?? new Set<string>();
    branches.add(fileDiff.branch_name);
    branchesByPath.set(fileDiff.file_path, branches);
  }

  return [...branchesByPath.values()].filter((branches) => branches.size > 1).length;
}

function buildExportMarkdown(bundle: CompareSessionBundle, overlapFiles: number) {
  const session = bundle.session;
  const branches = bundle.branches.sort((left, right) => left.ordinal - right.ordinal);
  const filesByPath = new Map<string, FileDiffRecord[]>();
  for (const fileDiff of bundle.fileDiffs) {
    const entries = filesByPath.get(fileDiff.file_path) ?? [];
    entries.push(fileDiff);
    filesByPath.set(fileDiff.file_path, entries);
  }

  const lines = [
    `# MoreDiff Review Summary`,
    "",
    `Repository: ${session.repo_owner}/${session.repo_name}`,
    `Base branch: ${session.base_branch}`,
    `Compare branches: ${branches.map((branch) => branch.branch_name).join(", ")}`,
    `Changed files: ${filesByPath.size}`,
    `Overlap files: ${overlapFiles}`,
    "",
  ];

  if (bundle.pullRequests.length > 0) {
    lines.push("## Imported Pull Requests", "");
    for (const pullRequest of bundle.pullRequests.sort(
      (left, right) => left.number - right.number,
    )) {
      lines.push(
        `- #${pullRequest.number} ${pullRequest.title} (${pullRequest.headBranch} -> ${pullRequest.baseBranch})`,
      );
    }
    lines.push("");
  }

  lines.push("## File Matrix", "");
  for (const [filePath, entries] of [...filesByPath.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    const touchedBranches = entries
      .sort((left, right) => left.branch_name.localeCompare(right.branch_name))
      .map(
        (entry) =>
          `${entry.branch_name} ${entry.status} (+${entry.additions}/-${entry.deletions})`,
      )
      .join("; ");
    lines.push(`- ${filePath}: ${touchedBranches}`);
  }
  lines.push("");

  if (bundle.reviewNotes.length > 0) {
    lines.push("## Review Notes", "");
    for (const note of bundle.reviewNotes.sort((left, right) =>
      left.filePath.localeCompare(right.filePath),
    )) {
      const lineRef = note.lineNumber ? `:${note.lineNumber}` : "";
      lines.push(
        `- [${note.status}] ${note.filePath}${lineRef} (${note.branchName}): ${note.body}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
