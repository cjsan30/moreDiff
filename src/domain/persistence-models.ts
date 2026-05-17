import type { FileStatus } from "@/src/domain/types";

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

export interface CompareSessionBundle {
  session: CompareSessionRecord;
  branches: SessionBranchRecord[];
  fileDiffs: FileDiffRecord[];
  workspaceEdits: WorkspaceEditRecord[];
}

export interface SavedCompareSessionSummary {
  id: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
  branchHeads: Record<string, string>;
  savedAt: string;
  lastOpenedAt?: string;
}
