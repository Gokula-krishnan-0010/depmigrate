import { describe, it, expect } from "vitest";
import { runTypecheck } from "../../src/verify/typecheck.js";
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "..", "..", "fixtures", "demo-repo");

describe("Typecheck", () => {
  it("returns a result object with passed and errors", () => {
    const result = runTypecheck(FIXTURE_DIR);
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
