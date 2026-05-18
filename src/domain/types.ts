export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface BranchDiffFile {
  path: string;
  basePath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string;
  content: string;
  contentLoaded: boolean;
  baseContent?: string;
  baseContentLoaded?: boolean;
}

export interface CompareBranch {
  name: string;
  headSha: string;
  files: BranchDiffFile[];
}

export interface CompareSessionInput {
  repository: {
    owner: string;
    name: string;
  };
  baseBranch: string;
  branches: CompareBranch[];
}

export interface FileMatrixRow {
  path: string;
  branches: Array<{
    branchName: string;
    changed: boolean;
    status?: FileStatus;
    additions?: number;
    deletions?: number;
  }>;
}

export interface HunkOverlap {
  path: string;
  startLine: number;
  endLine: number;
  branches: string[];
}

export interface ReviewNote {
  id: string;
  sessionId: string;
  branchName: string;
  filePath: string;
  lineNumber?: number;
  body: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export interface ImportedPullRequest {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  isSameRepository: boolean;
  updatedAt: string;
  authorLogin: string;
}

export interface CompareSessionViewModel extends CompareSessionInput {
  fileMatrix: FileMatrixRow[];
  overlapFiles: string[];
  hunkOverlaps: HunkOverlap[];
}
