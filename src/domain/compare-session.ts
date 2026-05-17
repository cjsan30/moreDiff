import type {
  CompareSessionInput,
  CompareSessionViewModel,
  FileMatrixRow,
  HunkOverlap,
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
  const hunkOverlaps = buildHunkOverlaps(input);

  return {
    ...input,
    fileMatrix,
    overlapFiles,
    hunkOverlaps,
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

interface ParsedHunkRange {
  startLine: number;
  endLine: number;
}

function buildHunkOverlaps(input: CompareSessionInput): HunkOverlap[] {
  const overlaps = new Map<string, HunkOverlap>();
  const paths = new Set(input.branches.flatMap((branch) => branch.files.map((file) => file.path)));

  for (const path of paths) {
    const branchRanges = input.branches
      .map((branch) => {
        const file = branch.files.find((candidate) => candidate.path === path);
        return {
          branchName: branch.name,
          ranges: file ? parsePatchHunkRanges(file.patch) : [],
        };
      })
      .filter((branch) => branch.ranges.length > 0);

    for (let leftIndex = 0; leftIndex < branchRanges.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < branchRanges.length; rightIndex += 1) {
        for (const leftRange of branchRanges[leftIndex].ranges) {
          for (const rightRange of branchRanges[rightIndex].ranges) {
            const startLine = Math.max(leftRange.startLine, rightRange.startLine);
            const endLine = Math.min(leftRange.endLine, rightRange.endLine);
            if (startLine > endLine) {
              continue;
            }

            const branches = [
              branchRanges[leftIndex].branchName,
              branchRanges[rightIndex].branchName,
            ].sort();
            const key = `${path}:${startLine}:${endLine}:${branches.join(",")}`;
            overlaps.set(key, {
              path,
              startLine,
              endLine,
              branches,
            });
          }
        }
      }
    }
  }

  return [...overlaps.values()].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    return left.startLine - right.startLine;
  });
}

function parsePatchHunkRanges(patch: string): ParsedHunkRange[] {
  const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  const ranges: ParsedHunkRange[] = [];
  let match: RegExpExecArray | null;

  while ((match = hunkHeaderPattern.exec(patch)) !== null) {
    const oldStart = Number.parseInt(match[1], 10);
    const oldLines = Number.parseInt(match[2] ?? "1", 10);
    const newStart = Number.parseInt(match[3], 10);
    const newLines = Number.parseInt(match[4] ?? "1", 10);
    const changedStart = newLines > 0 ? newStart : oldStart;
    const changedLines = Math.max(newLines > 0 ? newLines : oldLines, 1);

    ranges.push({
      startLine: changedStart,
      endLine: changedStart + changedLines - 1,
    });
  }

  return ranges;
}
