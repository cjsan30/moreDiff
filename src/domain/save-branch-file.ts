export interface SaveBranchFileInput {
  branch: string;
  path: string;
  message: string;
}

export function validateSaveBranchFileInput(input: SaveBranchFileInput): void {
  if (input.branch.trim().length === 0) {
    throw new Error("branch is required");
  }

  if (input.path.trim().length === 0) {
    throw new Error("path is required");
  }

  if (input.message.trim().length === 0) {
    throw new Error("commit message is required");
  }
}
