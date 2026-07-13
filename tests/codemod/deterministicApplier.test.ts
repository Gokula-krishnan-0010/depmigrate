import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyDeterministicCodemod } from "../../src/codemod/deterministicApplier.js";
import type { CallSite, RuleCacheEntry } from "../../src/scan/types.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("Deterministic Applier", () => {
  let tempDir: string;
  let tempFile: string;

  const sampleCode = `
function createFixedBuffer() {
  const buf = new Buffer(16);
  return buf;
}
`.trim();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "depmigrate-test-"));
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    tempFile = path.join(srcDir, "test.js");
    fs.writeFileSync(tempFile, sampleCode, "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("replaces new Buffer(16) with Buffer.alloc(16)", () => {
    const callSite: CallSite = {
      id: "cs_001",
      file: "src/test.js",
      line: 2,
      symbol: "Buffer",
      argType: "number_literal",
    };

    const rule: RuleCacheEntry = {
      symbol: "Buffer",
      argType: "number_literal",
      newExpression: "Buffer.alloc({0})",
      transformType: "deterministic",
      source: "Node DEP0005",
      confidenceHistory: 0.95,
    };

    const result = applyDeterministicCodemod(callSite, rule, tempDir);

    expect(result.usedLlm).toBe(false);
    expect(result.newCode).toBe("Buffer.alloc(16)");
    expect(result.selfConfidence).toBe(1.0);

    const modified = fs.readFileSync(tempFile, "utf-8");
    expect(modified).toContain("Buffer.alloc(16)");
    expect(modified).not.toContain("new Buffer(16)");
  });

  it("replaces new Buffer('str') with Buffer.from('str')", () => {
    const strCode = `const buf = new Buffer("hello");`;
    fs.writeFileSync(tempFile, strCode, "utf-8");

    const callSite: CallSite = {
      id: "cs_002",
      file: "src/test.js",
      line: 1,
      symbol: "Buffer",
      argType: "string_literal",
    };

    const rule: RuleCacheEntry = {
      symbol: "Buffer",
      argType: "string_literal",
      newExpression: "Buffer.from({0})",
      transformType: "deterministic",
      source: "Node DEP0005",
      confidenceHistory: 0.98,
    };

    const result = applyDeterministicCodemod(callSite, rule, tempDir);

    expect(result.newCode).toBe('Buffer.from("hello")');
    expect(result.usedLlm).toBe(false);
  });
});
