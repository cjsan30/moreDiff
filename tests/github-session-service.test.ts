import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCompareSessionFromGitHub,
  saveBranchFileToGitHub,
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
