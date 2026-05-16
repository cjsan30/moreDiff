import type {
  CompareSessionInput,
  CompareSessionViewModel,
  FileMatrixRow,
} from "@/src/domain/types";

const MIN_BRANCHES = 2;
const MAX_BRANCHES = 6;

export function createCompareSession(
  input: CompareSessionInput,
): CompareSessionViewModel {
  validateCompareSessionRequest({
    baseBranch: input.baseBranch,
    compareBranches: input.branches.map((branch) => branch.name),
  });

  const branchNames = input.branches.map((branch) => branch.name);
  const duplicateNames = findDuplicates(branchNames);
  if (duplicateNames.length > 0) {
    throw new Error(
      `duplicate compare branches are not allowed: ${duplicateNames.join(", ")}`,
    );
  }

  const fileMatrix = buildFileMatrix(input);
  const overlapFiles = fileMatrix
    .filter((row) => row.branches.filter((branch) => branch.changed).length > 1)
    .map((row) => row.path);

  return {
    ...input,
    fileMatrix,
    overlapFiles,
  };
}

export function validateCompareSessionRequest(input: {
  baseBranch: string;
  compareBranches: string[];
}): void {
  const baseBranch = input.baseBranch.trim();
  if (baseBranch.length === 0) {
    throw new Error("base branch is required");
  }

  validateBranchCount(input.compareBranches.length);

  const compareBranches = input.compareBranches.map((branch) => branch.trim());
  const emptyCompareBranch = compareBranches.find((branch) => branch.length === 0);
  if (emptyCompareBranch !== undefined) {
    throw new Error("compare branches must not be empty");
  }

  const duplicateNames = findDuplicates(compareBranches);
  if (duplicateNames.length > 0) {
    throw new Error(
      `duplicate compare branches are not allowed: ${duplicateNames.join(", ")}`,
    );
  }

  if (compareBranches.includes(baseBranch)) {
    throw new Error("base branch cannot be included in compare branches");
  }
}

export function validateBranchCount(count: number): void {
  if (count < MIN_BRANCHES || count > MAX_BRANCHES) {
    throw new Error(
      `compare sessions require between ${MIN_BRANCHES} and ${MAX_BRANCHES} branches`,
    );
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates];
}

function buildFileMatrix(input: CompareSessionInput): FileMatrixRow[] {
  const pathSet = new Set<string>();
  for (const branch of input.branches) {
    for (const file of branch.files) {
      pathSet.add(file.path);
    }
  }

  return [...pathSet]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      branches: input.branches.map((branch) => {
        const file = branch.files.find((candidate) => candidate.path === path);

        return {
          branchName: branch.name,
          changed: Boolean(file),
          status: file?.status,
          additions: file?.additions,
          deletions: file?.deletions,
        };
      }),
    }));
}
