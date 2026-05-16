import { describe, expect, it } from "vitest";

import {
  assertPatToken,
  parseGitHubRepositoryUrl,
} from "@/src/domain/github-connection";

describe("github connection helpers", () => {
  it("parses a github repository URL", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/openai/codex")).toEqual({
      owner: "openai",
      name: "codex",
      url: "https://github.com/openai/codex",
    });
  });

  it("rejects a non-github URL", () => {
    expect(() => parseGitHubRepositoryUrl("https://gitlab.com/openai/codex")).toThrow(
      "only github.com repositories are supported",
    );
  });

  it("requires a plausible PAT token length", () => {
    expect(() => assertPatToken("short-token")).toThrow(
      "personal access token looks too short",
    );
  });
});
