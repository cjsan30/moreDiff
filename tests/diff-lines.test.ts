import { describe, expect, it } from "vitest";

import { parseUnifiedPatchForSplitView } from "@/src/ui/components/diff-lines";

describe("diff line parsing", () => {
  it("maps unified diff lines into split view rows", () => {
    expect(
      parseUnifiedPatchForSplitView(
        "@@ -1,3 +1,3 @@\n context\n-old\n+new",
      ),
    ).toEqual([
      {
        kind: "hunk",
        left: "@@ -1,3 +1,3 @@",
        right: "@@ -1,3 +1,3 @@",
      },
      {
        kind: "context",
        left: "context",
        right: "context",
      },
      {
        kind: "delete",
        left: "old",
        right: "",
      },
      {
        kind: "add",
        left: "",
        right: "new",
      },
    ]);
  });
});
