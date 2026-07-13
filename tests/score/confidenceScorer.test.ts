import { describe, it, expect } from "vitest";
import { calculateConfidence } from "../../src/score/confidenceScorer.js";
import type {
  CodemodResult,
  VerificationResult,
  RuleCacheEntry,
} from "../../src/scan/types.js";

describe("Confidence Scorer", () => {
  const deterministicCodemod: CodemodResult = {
    callSiteId: "cs_001",
    originalCode: "new Buffer(16)",
    newCode: "Buffer.alloc(16)",
    usedLlm: false,
    rationale: "Deterministic rule",
    selfConfidence: 1.0,
  };

  const llmCodemod: CodemodResult = {
    callSiteId: "cs_004",
    originalCode: "new Buffer(userInput)",
    newCode: "Buffer.from(userInput)",
    usedLlm: true,
    rationale: "LLM derived",
    selfConfidence: 0.4,
  };

  const passingVerification: VerificationResult = {
    callSiteId: "cs_001",
    typecheckPassed: true,
    testsPassed: true,
    hasCoverage: true,
    errors: [],
  };

  const failingVerification: VerificationResult = {
    callSiteId: "cs_004",
    typecheckPassed: true,
    testsPassed: false,
    hasCoverage: false,
    errors: ["Test failed"],
  };

  const rule: RuleCacheEntry = {
    symbol: "Buffer",
    argType: "number_literal",
    newExpression: "Buffer.alloc({0})",
    transformType: "deterministic",
    source: "Node DEP0005",
    confidenceHistory: 0.95,
  };

  it("scores a deterministic + passing migration highly", () => {
    const score = calculateConfidence(
      deterministicCodemod,
      passingVerification,
      rule
    );
    // C = 0.3*1.0 + 0.5*1.0 + 0.2*0.95 = 0.3 + 0.5 + 0.19 = 0.99
    expect(score.overall).toBeGreaterThanOrEqual(0.9);
    expect(score.evidence).toContainEqual(
      expect.stringContaining("Deterministic")
    );
  });

  it("scores an LLM + failing migration low", () => {
    const score = calculateConfidence(
      llmCodemod,
      failingVerification,
      null
    );
    // M = 0.4 * 0.6 = 0.24, V = 0.5 (typecheck only), H = 0
    // C = 0.3*0.24 + 0.5*0.5 + 0.2*0 = 0.072 + 0.25 + 0 = 0.322
    expect(score.overall).toBeLessThan(0.5);
    expect(score.evidence).toContainEqual(
      expect.stringContaining("LLM")
    );
  });

  it("includes evidence checklist in the score", () => {
    const score = calculateConfidence(
      deterministicCodemod,
      passingVerification,
      rule
    );
    expect(score.evidence.length).toBeGreaterThan(0);
    expect(score.evidence).toContainEqual(
      expect.stringContaining("Type-safe")
    );
    expect(score.evidence).toContainEqual(
      expect.stringContaining("Tests pass")
    );
  });
});
