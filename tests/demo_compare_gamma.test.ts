import { describe, expect, it } from "vitest";

describe("demo compare gamma fixture", () => {
  it("keeps the gamma branch fixture active", () => {
    expect("codex/agent-tests/demo-compare-gamma").toContain("gamma");
  });
});
