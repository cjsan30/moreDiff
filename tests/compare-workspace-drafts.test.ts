import { describe, expect, it } from "vitest";

import {
  buildWorkspaceDraftMap,
  countWorkspaceDirtyDrafts,
  countWorkspaceDirtyDraftsForPath,
  createWorkspaceDraftKey,
  isWorkspaceDraftDirty,
} from "@/src/ui/components/compare-workspace-drafts";

describe("compare workspace draft tracking", () => {
  const session = {
    branches: [
      {
        name: "feature/a",
        headSha: "a",
        files: [
          {
            path: "src/app.ts",
            status: "modified" as const,
            additions: 1,
            deletions: 0,
            patch: "@@",
            content: "alpha",
          },
        ],
      },
      {
        name: "feature/b",
        headSha: "b",
        files: [
          {
            path: "src/app.ts",
            status: "modified" as const,
            additions: 1,
            deletions: 0,
            patch: "@@",
            content: "beta",
          },
        ],
      },
    ],
  };

  it("tracks dirty drafts independently per branch and file", () => {
    const savedContents = buildWorkspaceDraftMap(session);
    const drafts = {
      ...savedContents,
      [createWorkspaceDraftKey("feature/a", "src/app.ts")]: "alpha changed",
    };

    expect(
      isWorkspaceDraftDirty(
        drafts,
        savedContents,
        createWorkspaceDraftKey("feature/a", "src/app.ts"),
      ),
    ).toBe(true);
    expect(
      isWorkspaceDraftDirty(
        drafts,
        savedContents,
        createWorkspaceDraftKey("feature/b", "src/app.ts"),
      ),
    ).toBe(false);
    expect(countWorkspaceDirtyDrafts(drafts, savedContents)).toBe(1);
    expect(
      countWorkspaceDirtyDraftsForPath(
        drafts,
        savedContents,
        ["feature/a", "feature/b"],
        "src/app.ts",
      ),
    ).toBe(1);
  });
});
