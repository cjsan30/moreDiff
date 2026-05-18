import { describe, expect, it } from "vitest";

import { buildMockCompareSession } from "@/src/data/mock-session";

describe("mock compare workspace integration", () => {
  it("builds a session with overlap files and multiple branches", () => {
    const session = buildMockCompareSession();

    expect(session.branches).toHaveLength(3);
    expect(session.fileMatrix.length).toBeGreaterThan(0);
    expect(session.overlapFiles).toContain("app/login/page.tsx");
  });

  it("includes base code and long modified demo code for side-by-side review", () => {
    const session = buildMockCompareSession();
    const loginCopy = session.branches[0].files.find(
      (file) => file.path === "app/login/page.tsx",
    );

    expect(loginCopy?.baseContentLoaded).toBe(true);
    expect(loginCopy?.baseContent).toContain("const title = \"로그인\"");
    expect(loginCopy?.content).toContain("다시 오신 것을 환영합니다");
    expect(loginCopy?.content.split("\n").length).toBeGreaterThanOrEqual(30);
  });
});
