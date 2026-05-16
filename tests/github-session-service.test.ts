import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCompareSessionFromGitHub,
  saveBranchFileToGitHub,
} from "@/src/data/github-session-service";

const VALID_TOKEN = "github_pat_1234567890123456789012345678901234567890";
const VALID_REPO_URL = "https://github.com/openai/codex";

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
        branch: "feature/a",
        path: "src/app.ts",
        content: "console.log('hi')",
        message: "   ",
      }),
    ).rejects.toThrow("commit message is required");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
