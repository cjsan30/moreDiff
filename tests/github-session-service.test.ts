import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCompareSessionFromGitHub,
  createPullRequestOnGitHub,
  listPullRequestsFromGitHub,
  loadBranchFileContentFromGitHub,
  saveBranchFileToGitHub,
  updatePullRequestOnGitHub,
  validatePatConnection,
} from "@/src/data/github-session-service";

const VALID_TOKEN = "github_pat_1234567890123456789012345678901234567890";
const VALID_REPO_URL = "https://github.com/openai/codex";
const VALID_SAVE_CONTEXT = {
  baseBranch: "main",
  branch: "feature/a",
  compareBranches: ["feature/a", "feature/b"],
  expectedHeadSha: "head-123",
};

describe("github session service validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects compare requests without a base branch before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildCompareSessionFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        baseBranch: "   ",
        compareBranches: ["feature/a", "feature/b"],
      }),
    ).rejects.toThrow("기준 브랜치가 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads accessible repositories with a token before a repository is selected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          login: "octo",
          id: 1,
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            name: "alpha",
            full_name: "octo/alpha",
            private: true,
            default_branch: "main",
            html_url: "https://github.com/octo/alpha",
            owner: {
              login: "octo",
            },
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      validatePatConnection({
        token: VALID_TOKEN,
      }),
    ).resolves.toMatchObject({
      viewerLogin: "octo",
      repository: null,
      branches: [],
      repositories: [
        {
          owner: "octo",
          name: "alpha",
          fullName: "octo/alpha",
          url: "https://github.com/octo/alpha",
          isPrivate: true,
          defaultBranch: "main",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });

  it("rejects compare requests with duplicate branches before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildCompareSessionFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        baseBranch: "main",
        compareBranches: ["feature/a", "feature/a"],
      }),
    ).rejects.toThrow("중복 비교 브랜치는 허용되지 않습니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists open pull requests for PR-based session import", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json([
        {
          number: 7,
          title: "기능 A",
          state: "open",
          html_url: "https://github.com/openai/codex/pull/7",
          updated_at: "2026-05-17T00:00:00Z",
          user: {
            login: "octo",
          },
          base: {
            ref: "main",
            repo: {
              full_name: "openai/codex",
            },
          },
          head: {
            ref: "feature/a",
            sha: "head-a",
            repo: {
              full_name: "openai/codex",
            },
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listPullRequestsFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
      }),
    ).resolves.toEqual([
      {
        number: 7,
        title: "기능 A",
        state: "open",
        url: "https://github.com/openai/codex/pull/7",
        baseBranch: "main",
        headBranch: "feature/a",
        headSha: "head-a",
        isSameRepository: true,
        updatedAt: "2026-05-17T00:00:00Z",
        authorLogin: "octo",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/codex/pulls?state=open&per_page=100&sort=updated&direction=desc",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });

  it("rejects pull request creation without a title before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPullRequestOnGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        title: "   ",
        baseBranch: "main",
        headBranch: "feature/a",
      }),
    ).rejects.toThrow("풀 리퀘스트 제목이 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects pull request creation when head and base branches match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPullRequestOnGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        title: "PR 열기",
        baseBranch: "main",
        headBranch: "main",
      }),
    ).rejects.toThrow("풀 리퀘스트 헤드 브랜치는 기준 브랜치와 달라야 합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates pull request metadata through GitHub", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        number: 7,
        title: "수정된 제목",
        state: "open",
        html_url: "https://github.com/openai/codex/pull/7",
        updated_at: "2026-05-17T01:00:00Z",
        user: {
          login: "octo",
        },
        base: {
          ref: "main",
          repo: {
            full_name: "openai/codex",
          },
        },
        head: {
          ref: "feature/a",
          sha: "head-a",
          repo: {
            full_name: "openai/codex",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updatePullRequestOnGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        pullNumber: 7,
        title: "수정된 제목",
      }),
    ).resolves.toMatchObject({
      number: 7,
      title: "수정된 제목",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/codex/pulls/7",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  it("rejects compare requests when the base branch is included before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildCompareSessionFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        baseBranch: "main",
        compareBranches: ["feature/a", "main"],
      }),
    ).rejects.toThrow("기준 브랜치는 비교 브랜치에 포함될 수 없습니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds compare sessions without eagerly loading every changed file content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          files: [
            {
              filename: "src/app.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@ -1,1 +1,2 @@",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          files: [
            {
              filename: "src/other.ts",
              status: "added",
              additions: 4,
              deletions: 0,
              patch: "@@ -0,0 +1,4 @@",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          name: "feature/a",
          commit: {
            sha: "head-a",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          name: "feature/b",
          commit: {
            sha: "head-b",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildCompareSessionFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        baseBranch: "main",
        compareBranches: ["feature/a", "feature/b"],
      }),
    ).resolves.toMatchObject({
      branches: [
        {
          name: "feature/a",
          files: [
            {
              path: "src/app.ts",
              content: "",
              contentLoaded: false,
            },
          ],
        },
        {
          name: "feature/b",
          files: [
            {
              path: "src/other.ts",
              content: "",
              contentLoaded: false,
            },
          ],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/contents/")),
    ).toBe(false);
  });

  it("keeps six-branch compare loading bounded to compare and head requests", async () => {
    const compareBranches = Array.from(
      { length: 6 },
      (_, index) => `feature/${index + 1}`,
    );
    const fetchMock = vi.fn();
    for (const branchIndex of compareBranches.keys()) {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          files: Array.from({ length: 25 }, (_, fileIndex) => ({
            filename: `src/branch-${branchIndex}/file-${fileIndex}.ts`,
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: `@@ -${fileIndex + 1},1 +${fileIndex + 1},2 @@`,
          })),
        }),
      );
    }
    for (const branchName of compareBranches) {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          name: branchName,
          commit: {
            sha: `head-${branchName}`,
          },
        }),
      );
    }
    vi.stubGlobal("fetch", fetchMock);

    const session = await buildCompareSessionFromGitHub({
      token: VALID_TOKEN,
      repoUrl: VALID_REPO_URL,
      baseBranch: "main",
      compareBranches,
    });

    expect(session.branches).toHaveLength(6);
    expect(session.fileMatrix).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/contents/")),
    ).toBe(false);
  });

  it("loads one branch file content with head validation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          name: "feature/a",
          commit: {
            sha: "head-123",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "blob-123",
          content: Buffer.from("loaded content").toString("base64"),
          encoding: "base64",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "base-blob-123",
          content: Buffer.from("base content").toString("base64"),
          encoding: "base64",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadBranchFileContentFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        path: "src/app.ts",
        status: "modified",
      }),
    ).resolves.toEqual({
      baseContent: "base content",
      baseContentSha: "base-blob-123",
      content: "loaded content",
      contentSha: "blob-123",
      headSha: "head-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns empty base code for added files without reading the base branch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          name: "feature/a",
          commit: {
            sha: "head-123",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "blob-added",
          content: Buffer.from("new content").toString("base64"),
          encoding: "base64",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadBranchFileContentFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        path: "src/new.ts",
        status: "added",
      }),
    ).resolves.toMatchObject({
      baseContent: "",
      baseContentSha: "",
      content: "new content",
      contentSha: "blob-added",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("ref=main"),
      ),
    ).toBe(false);
  });

  it("rejects save requests without a branch before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "   ",
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("브랜치가 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests without a path before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "feature/a",
        path: "   ",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("파일 경로가 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests with parent directory traversal before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "feature/a",
        path: "../secrets.txt",
        content: "leak",
        message: "Update app",
      }),
    ).rejects.toThrow("파일 경로에는 상위 디렉터리 구간이 포함될 수 없습니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests with absolute paths before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "feature/a",
        path: "/etc/passwd",
        content: "leak",
        message: "Update app",
      }),
    ).rejects.toThrow("파일 경로는 저장소 루트 기준 상대 경로여야 합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests without a commit message before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "feature/a",
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "   ",
      }),
    ).rejects.toThrow("커밋 메시지가 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests that target the base branch before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "main",
        compareBranches: ["main", "feature/b"],
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("기준 브랜치에는 변경사항을 저장할 수 없습니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests outside the selected compare branches before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        branch: "feature/c",
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("저장 대상 브랜치는 비교 브랜치 중 하나여야 합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects save requests without an expected head SHA before GitHub calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        expectedHeadSha: "   ",
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("예상 브랜치 HEAD SHA가 필요합니다");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the current branch head before loading file content for save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        name: "feature/a",
        commit: {
          sha: "head-999",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).rejects.toThrow("브랜치 HEAD가 변경되었습니다. 저장하기 전에 비교 세션을 다시 불러오세요");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/codex/branches/feature%2Fa",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });

  it("returns the new branch head after saving a branch file", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          name: "feature/a",
          commit: {
            sha: "head-123",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sha: "blob-old",
          content: Buffer.from("old").toString("base64"),
          encoding: "base64",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          content: {
            sha: "blob-new",
          },
          commit: {
            sha: "head-456",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveBranchFileToGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "Update app",
      }),
    ).resolves.toEqual({
      headSha: "head-456",
      contentSha: "blob-new",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/openai/codex/contents/src%2Fapp.ts",
      expect.objectContaining({
        method: "PUT",
      }),
    );
  });
});
