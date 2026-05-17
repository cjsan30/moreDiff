import type { FileStatus, ImportedPullRequest, ReviewNote } from "@/src/domain/types";

export interface UserRecord {
  id: string;
  github_account_id: string;
  login: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubConnectionRecord {
  id: string;
  user_id: string;
  github_account_id: string;
  github_login: string;
  access_token_ref: string;
  created_at: string;
  updated_at: string;
}

export interface CompareSessionRecord {
  id: string;
  user_id: string;
  repo_owner: string;
  repo_name: string;
  repo_url: string;
  base_branch: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface SessionBranchRecord {
  id: string;
  session_id: string;
  branch_name: string;
  ordinal: number;
  head_sha: string;
}

export interface FileDiffRecord {
  id: string;
  session_id: string;
  branch_name: string;
  file_path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string;
}

export interface WorkspaceEditRecord {
  id: string;
  session_id: string;
  branch_name: string;
  file_path: string;
  original_sha: string;
  edited_content: string;
  saved_at: string;
}

export interface PullRequestImportRecord extends ImportedPullRequest {
  id: string;
  session_id: string;
  imported_at: string;
}

export interface ReviewNoteRecord extends ReviewNote {
  user_id: string;
}

export interface AuditEventRecord {
  id: string;
  user_id: string;
  session_id: string;
  event_type:
    | "session.saved"
    | "session.opened"
    | "diff.loaded"
    | "workspace_edit.saved"
    | "review_note.saved"
    | "review_note.resolved"
    | "summary.exported";
  entity_type: "session" | "diff" | "workspace_edit" | "review_note" | "summary";
  entity_id: string;
  metadata: Record<string, string | number | boolean>;
  created_at: string;
}

export interface CompareSessionBundle {
  session: CompareSessionRecord;
  branches: SessionBranchRecord[];
  fileDiffs: FileDiffRecord[];
  workspaceEdits: WorkspaceEditRecord[];
  pullRequests: PullRequestImportRecord[];
  reviewNotes: ReviewNoteRecord[];
  auditEvents: AuditEventRecord[];
}

export interface SavedCompareSessionSummary {
  id: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads: Record<string, string>;
  pullRequests: ImportedPullRequest[];
  savedAt: string;
  lastOpenedAt?: string;
}
