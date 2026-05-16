import { describe, expect, it } from "vitest";

import { buildMockCompareSession } from "@/src/data/mock-session";

describe("workspace smoke", () => {
  it("covers a matrix shape suitable for rendering", () => {
    const session = buildMockCompareSession();

    expect(session.fileMatrix[0]?.branches.length).toBe(session.branches.length);
  });
});
