import { describe, it, expect } from "vitest";
import { runTests } from "../../src/verify/testRunner.js";
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "..", "..", "fixtures", "demo-repo");

describe("Test Runner", () => {
  it("runs the fixture test suite and returns results", () => {
    const result = runTests(FIXTURE_DIR);
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("hasCoverage");
  });

  it("passes on the unmodified fixture", () => {
    const result = runTests(FIXTURE_DIR);
    expect(result.passed).toBe(true);
  });
});
