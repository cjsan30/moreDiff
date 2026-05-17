import { describe, expect, it } from "vitest";

import {
  createRecentCompareSessionId,
  markRecentCompareSessionOpened,
  upsertRecentCompareSession,
} from "@/src/ui/components/recent-compare-sessions";

describe("recent compare session persistence", () => {
  it("uses stable ids for the same branch shape regardless of branch order", () => {
    const left = createRecentCompareSessionId({
      repoUrl: "https://github.com/acme/repo",
      baseBranch: "main",
      compareBranches: ["feature/a", "feature/b"],
    });
    const right = createRecentCompareSessionId({
      repoUrl: "https://github.com/acme/repo",
      baseBranch: "main",
      compareBranches: ["feature/b", "feature/a"],
    });

    expect(left).toBe(right);
  });

  it("upserts saved metadata without storing tokens", () => {
    const sessions = upsertRecentCompareSession(
      [],
      {
        repoUrl: "https://github.com/acme/repo",
        baseBranch: "main",
        compareBranches: ["feature/a", "feature/b"],
        branchHeads: {
          "feature/a": "head-a",
        },
      },
      {
        markOpened: true,
        now: "2026-05-17T00:00:00.000Z",
      },
    );

    expect(sessions).toEqual([
      {
        id: createRecentCompareSessionId({
          repoUrl: "https://github.com/acme/repo",
          baseBranch: "main",
          compareBranches: ["feature/a", "feature/b"],
        }),
        repoUrl: "https://github.com/acme/repo",
        baseBranch: "main",
        compareBranches: ["feature/a", "feature/b"],
        branchHeads: {
          "feature/a": "head-a",
        },
        savedAt: "2026-05-17T00:00:00.000Z",
        lastOpenedAt: "2026-05-17T00:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(sessions)).not.toContain("github_pat");
  });

  it("marks a saved session as opened", () => {
    const sessions = upsertRecentCompareSession(
      [],
      {
        repoUrl: "https://github.com/acme/repo",
        baseBranch: "main",
        compareBranches: ["feature/a", "feature/b"],
      },
      {
        now: "2026-05-17T00:00:00.000Z",
      },
    );

    expect(
      markRecentCompareSessionOpened(
        sessions,
        sessions[0].id,
        "2026-05-17T01:00:00.000Z",
      )[0].lastOpenedAt,
    ).toBe("2026-05-17T01:00:00.000Z");
  });
});
