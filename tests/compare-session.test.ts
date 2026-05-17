import { describe, expect, it } from "vitest";

import {
  createCompareSession,
  validateBranchCount,
  validateCompareSessionRequest,
} from "@/src/domain/compare-session";
import type { BranchDiffFile, CompareBranch } from "@/src/domain/types";

describe("compare session rules", () => {
  describe("branch selection validation", () => {
    it("rejects fewer than two branches", () => {
      expect(() => validateBranchCount(1)).toThrow(
        "compare sessions require between 2 and 6 branches",
      );
    });

    it("accepts the maximum six compare branches", () => {
      expect(() => validateBranchCount(6)).not.toThrow();
    });

    it("rejects more than six compare branches", () => {
      expect(() => validateBranchCount(7)).toThrow(
        "compare sessions require between 2 and 6 branches",
      );
    });

    it("rejects duplicate branch names", () => {
      expect(() =>
        createCompareSession({
          repository: { owner: "acme", name: "repo" },
          baseBranch: "main",
          branches: [
            buildBranch("feature/a", "1", []),
            buildBranch("feature/a", "2", []),
          ],
        }),
      ).toThrow("duplicate compare branches are not allowed");
    });

    it("requires a base branch for compare session requests", () => {
      expect(() =>
        validateCompareSessionRequest({
          baseBranch: "   ",
          compareBranches: ["feature/a", "feature/b"],
        }),
      ).toThrow("base branch is required");
    });

    it("rejects an empty compare branch name", () => {
      expect(() =>
        validateCompareSessionRequest({
          baseBranch: "main",
          compareBranches: ["feature/a", "   "],
        }),
      ).toThrow("compare branches must not be empty");
    });

    it("rejects compare requests that include the base branch", () => {
      expect(() =>
        validateCompareSessionRequest({
          baseBranch: "main",
          compareBranches: ["feature/a", "main"],
        }),
      ).toThrow("base branch cannot be included in compare branches");
    });
  });

  describe("file matrix and overlap detection", () => {
    it("sorts file matrix rows by path", () => {
      const session = createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches: [
          buildBranch("feature/a", "1", [
            buildFile("src/z.ts", "@@ -1 +1 @@"),
            buildFile("src/a.ts", "@@ -1 +1 @@"),
          ]),
          buildBranch("feature/b", "2", [buildFile("src/m.ts", "@@ -1 +1 @@")]),
        ],
      });

      expect(session.fileMatrix.map((row) => row.path)).toEqual([
        "src/a.ts",
        "src/m.ts",
        "src/z.ts",
      ]);
    });

    it("marks overlap files when multiple branches touch the same path", () => {
      const session = createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches: [
          buildBranch("feature/a", "1", [buildFile("src/app.ts", "@@")]),
          buildBranch("feature/b", "2", [
            buildFile("src/app.ts", "@@", {
              additions: 2,
              deletions: 1,
              content: "b",
            }),
          ]),
        ],
      });

      expect(session.overlapFiles).toEqual(["src/app.ts"]);
    });

    it("reports overlapping hunk regions when patches touch the same line range", () => {
      const session = createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches: [
          buildBranch("feature/a", "1", [
            buildFile("src/app.ts", "@@ -10,4 +10,6 @@\n-old\n+new", {
              additions: 3,
              deletions: 1,
            }),
          ]),
          buildBranch("feature/b", "2", [
            buildFile("src/app.ts", "@@ -12,3 +12,4 @@\n-old\n+new", {
              additions: 2,
              deletions: 1,
              content: "b",
            }),
          ]),
        ],
      });

      expect(session.hunkOverlaps).toEqual([
        {
          path: "src/app.ts",
          startLine: 12,
          endLine: 15,
          branches: ["feature/a", "feature/b"],
        },
      ]);
    });

    it("does not report hunk overlaps for adjacent non-intersecting ranges", () => {
      const session = createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches: [
          buildBranch("feature/a", "1", [
            buildFile("src/app.ts", "@@ -1,2 +1,2 @@"),
          ]),
          buildBranch("feature/b", "2", [
            buildFile("src/app.ts", "@@ -3,2 +3,2 @@"),
          ]),
        ],
      });

      expect(session.hunkOverlaps).toEqual([]);
    });
  });

  describe("scalability boundaries", () => {
    it("builds a six-branch matrix with hundreds of file entries", () => {
      const branches = Array.from({ length: 6 }, (_, branchIndex) =>
        buildBranch(
          `feature/${branchIndex + 1}`,
          `head-${branchIndex + 1}`,
          Array.from({ length: 80 }, (_, fileIndex) =>
            buildFile(
              `src/module-${fileIndex.toString().padStart(3, "0")}.ts`,
              `@@ -${fileIndex + 1},2 +${fileIndex + 1},3 @@`,
              {
                additions: branchIndex + 1,
                deletions: fileIndex % 3,
              },
            ),
          ),
        ),
      );

      const session = createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches,
      });

      expect(session.branches).toHaveLength(6);
      expect(session.fileMatrix).toHaveLength(80);
      expect(session.overlapFiles).toHaveLength(80);
      expect(session.hunkOverlaps.length).toBeGreaterThan(0);
    });
  });
});

function buildBranch(
  name: string,
  headSha: string,
  files: BranchDiffFile[],
): CompareBranch {
  return {
    name,
    headSha,
    files,
  };
}

function buildFile(
  path: string,
  patch: string,
  overrides: Partial<BranchDiffFile> = {},
): BranchDiffFile {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    patch,
    content: "a",
    contentLoaded: true,
    ...overrides,
  };
}
