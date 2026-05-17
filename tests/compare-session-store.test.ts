import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exportCompareSessionSummaryForToken,
  listCompareSessionsForToken,
  listReviewNotesForToken,
  readCompareSessionBundle,
  recordWorkspaceEditForToken,
  saveCompareSessionForToken,
  saveReviewNoteForToken,
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

  it("persists PR imports, review notes, workspace edits, audit events, and export summaries", async () => {
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
              additions: 1,
              deletions: 1,
              patch: "@@ -1 +1 @@\n-old\n+new",
              content: "",
              contentLoaded: false,
            },
          ],
        },
        {
          name: "feature/b",
          headSha: "head-b",
          files: [
            {
              path: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 0,
              patch: "@@ -1 +1,2 @@\n+new",
              content: "",
              contentLoaded: false,
            },
          ],
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
      pullRequests: [
        {
          number: 3,
          title: "Feature A",
          url: "https://github.com/octo/repo/pull/3",
          baseBranch: "main",
          headBranch: "feature/a",
          headSha: "head-a",
          isSameRepository: true,
          updatedAt: "2026-05-17T00:00:00.000Z",
          authorLogin: "octo",
        },
      ],
      storeFile,
      now: "2026-05-17T00:00:00.000Z",
    });
    const note = await saveReviewNoteForToken({
      token: TOKEN,
      sessionId: summary.id,
      branchName: "feature/a",
      filePath: "src/app.ts",
      body: "Check overlap before merge",
      storeFile,
      now: "2026-05-17T00:01:00.000Z",
    });
    const edit = await recordWorkspaceEditForToken({
      token: TOKEN,
      sessionId: summary.id,
      branchName: "feature/a",
      filePath: "src/app.ts",
      originalSha: "head-a",
      editedContent: "new content",
      storeFile,
      now: "2026-05-17T00:02:00.000Z",
    });
    const notes = await listReviewNotesForToken({
      token: TOKEN,
      sessionId: summary.id,
      storeFile,
    });
    const bundle = await readCompareSessionBundle({
      token: TOKEN,
      sessionId: summary.id,
      storeFile,
    });
    const exported = await exportCompareSessionSummaryForToken({
      token: TOKEN,
      sessionId: summary.id,
      storeFile,
      now: "2026-05-17T00:03:00.000Z",
    });

    expect(summary.pullRequests).toHaveLength(1);
    expect(note).toMatchObject({
      branchName: "feature/a",
      filePath: "src/app.ts",
      status: "open",
    });
    expect(edit).toMatchObject({
      branch_name: "feature/a",
      file_path: "src/app.ts",
    });
    expect(notes).toHaveLength(1);
    expect(bundle.pullRequests).toHaveLength(1);
    expect(bundle.reviewNotes).toHaveLength(1);
    expect(bundle.workspaceEdits).toHaveLength(1);
    expect(bundle.auditEvents.map((event) => event.event_type)).toEqual(
      expect.arrayContaining([
        "session.saved",
        "diff.loaded",
        "review_note.saved",
        "workspace_edit.saved",
      ]),
    );
    expect(exported.markdown).toContain("MoreDiff Review Summary");
    expect(exported.markdown).toContain("Check overlap before merge");
    expect(exported.stats).toMatchObject({
      branches: 2,
      files: 1,
      overlapFiles: 1,
      notes: 1,
      pullRequests: 1,
    });
  });
});
