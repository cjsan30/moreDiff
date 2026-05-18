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
      ).toThrow("github.com 저장소만 지원합니다");
    });

    it("rejects github.com URLs that are not HTTPS", () => {
      expect(() => parseGitHubRepositoryUrl("http://github.com/openai/codex")).toThrow(
        "저장소 URL은 https를 사용해야 합니다",
      );
    });
  });

  describe("PAT validation", () => {
    it("requires a plausible PAT token length", () => {
      expect(() => assertPatToken("short-token")).toThrow(
        "개인 액세스 토큰이 너무 짧습니다",
      );
    });

    it("rejects tokens containing whitespace", () => {
      expect(() =>
        assertPatToken("github_pat_12345678901234567890\nextra"),
      ).toThrow("개인 액세스 토큰에는 공백이 포함될 수 없습니다");
    });
  });
});
