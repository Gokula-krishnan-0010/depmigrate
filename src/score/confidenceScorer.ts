import type {
  CodemodResult,
  VerificationResult,
  ConfidenceScore,
  RuleCacheEntry,
} from "../scan/types.js";

/** Default weights: verification dominates until the cache has history */
const DEFAULT_WEIGHTS = {
  w1: 0.3, // Match quality
  w2: 0.5, // Verification
  w3: 0.2, // Historical accuracy
};

/**
 * Calculate the confidence score for a single migration.
 *
 * Formula: C = w1*M + w2*V + w3*H
 *
 * M: 1.0 exact cached rule, 0.6 LLM-derived, scaled down for inferred types
 * V: 1.0 typecheck+tests pass, 0.5 typecheck-only, 0 fail
 * H: rolling historical accuracy, 0 if never cached
 */
export function calculateConfidence(
  codemod: CodemodResult,
  verification: VerificationResult,
  rule: RuleCacheEntry | null,
  weights = DEFAULT_WEIGHTS
): ConfidenceScore {
  // M: Match quality
  let matchScore: number;
  if (!codemod.usedLlm) {
    matchScore = 1.0;
  } else {
    matchScore = codemod.selfConfidence * 0.6;
  }

  // V: Verification quality
  let verificationScore: number;
  if (verification.typecheckPassed && verification.testsPassed) {
    verificationScore = 1.0;
  } else if (verification.typecheckPassed) {
    verificationScore = 0.5;
  } else {
    verificationScore = 0.0;
  }

  // H: Historical accuracy
  const historyScore = rule?.confidenceHistory ?? 0;

  // Weighted combination
  const overall =
    weights.w1 * matchScore +
    weights.w2 * verificationScore +
    weights.w3 * historyScore;

  // Build evidence checklist
  const evidence: string[] = [];

  if (!codemod.usedLlm) {
    evidence.push("[✓] Deterministic rule match");
  } else {
    evidence.push(`[~] LLM-derived (self-confidence: ${(codemod.selfConfidence * 100).toFixed(0)}%)`);
  }

  if (verification.typecheckPassed) {
    evidence.push("[✓] Type-safe");
  } else {
    evidence.push("[✗] Type check failed");
  }

  if (verification.testsPassed) {
    evidence.push("[✓] Tests pass");
  } else {
    evidence.push("[✗] Tests failed");
  }

  if (verification.hasCoverage) {
    evidence.push("[✓] Test coverage exists");
  } else {
    evidence.push("[⚠] No test coverage for this call site");
  }

  if (rule) {
    evidence.push(`[✓] Rule source: ${rule.source}`);
    if (rule.confidenceHistory > 0) {
      evidence.push(
        `[✓] Historical confidence: ${(rule.confidenceHistory * 100).toFixed(0)}%`
      );
    }
  }

  return {
    callSiteId: codemod.callSiteId,
    matchScore,
    verificationScore,
    historyScore,
    overall: Math.round(overall * 100) / 100,
    evidence,
  };
}
