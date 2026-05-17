export interface SaveBranchFileInput {
  baseBranch: string;
  branch: string;
  compareBranches: string[];
  expectedHeadSha: string;
  path: string;
  message: string;
}

export function validateSaveBranchFileInput(input: SaveBranchFileInput): void {
  const baseBranch = input.baseBranch.trim();
  const branch = input.branch.trim();
  const compareBranches = input.compareBranches.map((candidate) =>
    candidate.trim(),
  );

  if (baseBranch.length === 0) {
    throw new Error("base branch is required");
  }

  if (branch.length === 0) {
    throw new Error("branch is required");
  }

  if (branch === baseBranch) {
    throw new Error("cannot save changes to the base branch");
  }

  if (compareBranches.length === 0) {
    throw new Error("compare branches are required for save");
  }

  if (!compareBranches.includes(branch)) {
    throw new Error("save branch must be one of the compare branches");
  }

  if (input.expectedHeadSha.trim().length === 0) {
    throw new Error("expected branch head SHA is required");
  }

  if (input.path.trim().length === 0) {
    throw new Error("path is required");
  }

  if (input.message.trim().length === 0) {
    throw new Error("commit message is required");
  }
}
