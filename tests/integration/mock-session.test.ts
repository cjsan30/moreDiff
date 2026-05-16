import { describe, expect, it } from "vitest";

import { buildMockCompareSession } from "@/src/data/mock-session";

describe("mock compare workspace integration", () => {
  it("builds a session with overlap files and multiple branches", () => {
    const session = buildMockCompareSession();

    expect(session.branches).toHaveLength(3);
    expect(session.fileMatrix.length).toBeGreaterThan(0);
    expect(session.overlapFiles).toContain("app/login/page.tsx");
  });
});
