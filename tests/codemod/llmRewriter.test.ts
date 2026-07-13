import { describe, it, expect } from "vitest";
import { applyLlmRewrite } from "../../src/codemod/llmRewriter.js";
import type { CallSite } from "../../src/scan/types.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("LLM Rewriter", () => {
  let tempDir: string;
  let tempFile: string;

  const sampleCode = `
function wrapDynamic(userInput) {
  return new Buffer(userInput);
}
`.trim();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "depmigrate-llm-test-"));
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    tempFile = path.join(srcDir, "test.js");
    fs.writeFileSync(tempFile, sampleCode, "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("produces a fallback result when no API key is set", async () => {
    // Clear API key for this test
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const callSite: CallSite = {
      id: "cs_004",
      file: "src/test.js",
      line: 2,
      symbol: "Buffer",
      argType: "unresolvable",
    };

    const result = await applyLlmRewrite(callSite, tempDir);

    expect(result.usedLlm).toBe(true);
    expect(result.selfConfidence).toBeLessThan(0.5);
    expect(result.newCode).toContain("Buffer.from");
    expect(result.rationale).toContain("Fallback");

    // Restore key
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("marks result as LLM-derived", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const callSite: CallSite = {
      id: "cs_004",
      file: "src/test.js",
      line: 2,
      symbol: "Buffer",
      argType: "unresolvable",
    };

    const result = await applyLlmRewrite(callSite, tempDir);
    expect(result.usedLlm).toBe(true);
    expect(result.callSiteId).toBe("cs_004");
  });
});
