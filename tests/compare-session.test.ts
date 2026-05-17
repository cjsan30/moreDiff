import { describe, expect, it } from "vitest";

import {
  createCompareSession,
  validateBranchCount,
  validateCompareSessionRequest,
} from "@/src/domain/compare-session";

describe("compare session rules", () => {
  it("rejects fewer than two branches", () => {
    expect(() => validateBranchCount(1)).toThrow(
      "compare sessions require between 2 and 6 branches",
    );
  });

  it("rejects duplicate branch names", () => {
    expect(() =>
      createCompareSession({
        repository: { owner: "acme", name: "repo" },
        baseBranch: "main",
        branches: [
          { name: "feature/a", headSha: "1", files: [] },
          { name: "feature/a", headSha: "2", files: [] },
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

  it("marks overlap files when multiple branches touch the same path", () => {
    const session = createCompareSession({
      repository: { owner: "acme", name: "repo" },
      baseBranch: "main",
      branches: [
        {
          name: "feature/a",
          headSha: "1",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 1,
              deletions: 0,
              patch: "@@",
              content: "a",
            },
          ],
        },
        {
          name: "feature/b",
          headSha: "2",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@",
              content: "b",
            },
          ],
        },
      ],
    });

    expect(session.overlapFiles).toEqual(["src/app.ts"]);
  });

  it("reports overlapping hunk regions when patches touch the same line range", () => {
    const session = createCompareSession({
      repository: { owner: "acme", name: "repo" },
      baseBranch: "main",
      branches: [
        {
          name: "feature/a",
          headSha: "1",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 3,
              deletions: 1,
              patch: "@@ -10,4 +10,6 @@\n-old\n+new",
              content: "a",
            },
          ],
        },
        {
          name: "feature/b",
          headSha: "2",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@ -12,3 +12,4 @@\n-old\n+new",
              content: "b",
            },
          ],
        },
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
});
