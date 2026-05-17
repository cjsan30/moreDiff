import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listCompareSessionsForToken,
  readCompareSessionBundle,
  saveCompareSessionForToken,
} from "@/src/data/compare-session-store";
import { createCompareSession } from "@/src/domain/compare-session";

const TOKEN = "github_pat_1234567890123456789012345678901234567890";

describe("compare session persistence store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists session metadata, branches, and file diffs without storing tokens", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(Response.json({
        login: "octo",
        id: 42,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dir = await mkdtemp(path.join(tmpdir(), "morediff-store-"));
    const storeFile = path.join(dir, "store.json");
    const viewModel = createCompareSession({
      repository: {
        owner: "octo",
        name: "repo",
      },
      baseBranch: "main",
      branches: [
        {
          name: "feature/a",
          headSha: "head-a",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@ -1 +1 @@",
              content: "",
              contentLoaded: false,
            },
          ],
        },
        {
          name: "feature/b",
          headSha: "head-b",
          files: [],
        },
      ],
    });

    const summary = await saveCompareSessionForToken({
      token: TOKEN,
      repoUrl: "https://github.com/octo/repo",
      baseBranch: "main",
      compareBranches: ["feature/a", "feature/b"],
      branchHeads: {
        "feature/a": "head-a",
        "feature/b": "head-b",
      },
      viewModel,
      storeFile,
      now: "2026-05-17T00:00:00.000Z",
    });
    const sessions = await listCompareSessionsForToken({
      token: TOKEN,
      storeFile,
    });
    const bundle = await readCompareSessionBundle({
      token: TOKEN,
      sessionId: summary.id,
      storeFile,
    });
    const persistedJson = await readFile(storeFile, "utf8");

    expect(sessions).toHaveLength(1);
    expect(summary).toMatchObject({
      repoUrl: "https://github.com/octo/repo",
      baseBranch: "main",
      compareBranches: ["feature/a", "feature/b"],
      branchHeads: {
        "feature/a": "head-a",
        "feature/b": "head-b",
      },
      savedAt: "2026-05-17T00:00:00.000Z",
    });
    expect(bundle.branches).toHaveLength(2);
    expect(bundle.fileDiffs).toEqual([
      expect.objectContaining({
        branch_name: "feature/a",
        file_path: "src/app.ts",
        status: "modified",
      }),
    ]);
    expect(persistedJson).not.toContain(TOKEN);
  });
});
