import { describe, expect, it } from "vitest";

import {
  assertPatToken,
  parseGitHubRepositoryUrl,
} from "@/src/domain/github-connection";

describe("github connection helpers", () => {
  describe("repository URL parsing", () => {
    it("parses a canonical HTTPS GitHub repository URL", () => {
      expect(parseGitHubRepositoryUrl("https://github.com/openai/codex")).toEqual({
        owner: "openai",
        name: "codex",
        url: "https://github.com/openai/codex",
      });
    });

    it("normalizes .git suffixes", () => {
      expect(
        parseGitHubRepositoryUrl("https://github.com/openai/codex.git"),
      ).toEqual({
        owner: "openai",
        name: "codex",
        url: "https://github.com/openai/codex",
      });
    });

    it("rejects a non-github URL", () => {
      expect(() =>
        parseGitHubRepositoryUrl("https://gitlab.com/openai/codex"),
      ).toThrow("only github.com repositories are supported");
    });

    it("rejects github.com URLs that are not HTTPS", () => {
      expect(() => parseGitHubRepositoryUrl("http://github.com/openai/codex")).toThrow(
        "repository URL must use https",
      );
    });
  });

  describe("PAT validation", () => {
    it("requires a plausible PAT token length", () => {
      expect(() => assertPatToken("short-token")).toThrow(
        "personal access token looks too short",
      );
    });

    it("rejects tokens containing whitespace", () => {
      expect(() =>
        assertPatToken("github_pat_12345678901234567890\nextra"),
      ).toThrow("personal access token must not contain whitespace");
    });
  });
});
