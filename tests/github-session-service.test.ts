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
    ).rejects.toThrow("base branch is required");

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
    ).rejects.toThrow("duplicate compare branches are not allowed");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists open pull requests for PR-based session import", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json([
        {
          number: 7,
          title: "Feature A",
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
        title: "Feature A",
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
    ).rejects.toThrow("pull request title is required");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates pull request metadata through GitHub", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        number: 7,
        title: "Updated title",
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
        title: "Updated title",
      }),
    ).resolves.toMatchObject({
      number: 7,
      title: "Updated title",
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
    ).rejects.toThrow("base branch cannot be included in compare branches");

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
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadBranchFileContentFromGitHub({
        token: VALID_TOKEN,
        repoUrl: VALID_REPO_URL,
        ...VALID_SAVE_CONTEXT,
        path: "src/app.ts",
      }),
    ).resolves.toEqual({
      content: "loaded content",
      contentSha: "blob-123",
      headSha: "head-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    ).rejects.toThrow("branch is required");

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
    ).rejects.toThrow("path is required");

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
    ).rejects.toThrow("commit message is required");

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
    ).rejects.toThrow("cannot save changes to the base branch");

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
    ).rejects.toThrow("save branch must be one of the compare branches");

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
    ).rejects.toThrow("expected branch head SHA is required");

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
    ).rejects.toThrow("branch head changed; reload compare session before saving");

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
