import { describe, expect, it } from "vitest";

import {
  buildLoadedWorkspaceBaseContentKeys,
  buildLoadedWorkspaceContentKeys,
  buildWorkspaceBaseContentMap,
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
            contentLoaded: true,
            baseContent: "base alpha",
            baseContentLoaded: true,
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
            contentLoaded: true,
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
    expect(buildWorkspaceBaseContentMap(session)).toEqual({
      [createWorkspaceDraftKey("feature/a", "src/app.ts")]: "base alpha",
    });
    expect(buildLoadedWorkspaceBaseContentKeys(session)).toEqual(
      new Set([createWorkspaceDraftKey("feature/a", "src/app.ts")]),
    );
    expect(
      countWorkspaceDirtyDraftsForPath(
        drafts,
        savedContents,
        ["feature/a", "feature/b"],
        "src/app.ts",
      ),
    ).toBe(1);
  });

  it("excludes lazy unloaded file content from initial drafts", () => {
    const lazySession = {
      branches: [
        {
          name: "feature/a",
          headSha: "a",
          files: [
            {
              path: "src/lazy.ts",
              status: "modified" as const,
              additions: 3,
              deletions: 1,
              patch: "@@",
              content: "",
              contentLoaded: false,
            },
          ],
        },
      ],
    };

    expect(buildWorkspaceDraftMap(lazySession)).toEqual({});
    expect(buildLoadedWorkspaceContentKeys(lazySession).size).toBe(0);
    expect(buildWorkspaceBaseContentMap(lazySession)).toEqual({});
    expect(buildLoadedWorkspaceBaseContentKeys(lazySession).size).toBe(0);
  });
});
