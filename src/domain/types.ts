export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface BranchDiffFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string;
  content: string;
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

export interface CompareSessionViewModel extends CompareSessionInput {
  fileMatrix: FileMatrixRow[];
  overlapFiles: string[];
}
