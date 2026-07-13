import { describe, it, expect } from "vitest";
import { semanticDiff } from "../../src/diff/semanticDiff.js";

describe("Semantic Diff", () => {
  it("detects only API surface modification for Buffer replacement", () => {
    const original = `
function createFixedBuffer() {
  const buf = new Buffer(16);
  return buf;
}
`.trim();

    const modified = `
function createFixedBuffer() {
  const buf = Buffer.alloc(16);
  return buf;
}
`.trim();

    const result = semanticDiff(original, modified, "test.js");
    expect(result.onlyApiSurfaceModified).toBe(true);
  });

  it("detects when non-API changes are made", () => {
    const original = `
function foo() {
  return new Buffer(16);
}
`.trim();

    const modified = `
function foo() {
  return Buffer.alloc(16);
}
function bar() {
  return 42;
}
`.trim();

    const result = semanticDiff(original, modified, "test.js");
    // Additional function added = structural change
    expect(result.changedNodeCount).toBeGreaterThan(0);
  });

  it("reports no changes for identical code", () => {
    const code = `const x = 1;`;
    const result = semanticDiff(code, code, "test.js");
    expect(result.changedNodeCount).toBe(0);
    expect(result.onlyApiSurfaceModified).toBe(true);
  });
});
