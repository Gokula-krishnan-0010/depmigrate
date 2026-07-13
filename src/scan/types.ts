/**
 * CallSite represents a single deprecated API usage found in the codebase.
 */
export interface CallSite {
  /** Unique identifier, e.g. "cs_001" */
  id: string;
  /** Relative file path from the scan root */
  file: string;
  /** Line number where the deprecated usage occurs */
  line: number;
  /** The deprecated symbol name, e.g. "Buffer" or "expo-av" */
  symbol: string;
  /** Classification of the deprecated usage */
  argType: string;
  /** The original source code snippet at this call site */
  snippet?: string;
}

/**
 * RuleCacheEntry represents a cached migration rule for a deprecated API pattern.
 */
export interface RuleCacheEntry {
  /** The deprecated symbol name */
  symbol: string;
  /** The argument type this rule applies to */
  argType: string;
  /** Template expression for the replacement, e.g. "Buffer.alloc({0})" */
  newExpression: string;
  /** Whether this rule can be applied deterministically, requires LLM, or is manual review */
  transformType: "deterministic" | "requires_llm" | "manual";
  /** Source of the deprecation info, e.g. "Node DEP0005" */
  source: string;
  /** Rolling average confidence from past uses, 0 if unused */
  confidenceHistory: number;
}

/**
 * Result of applying a codemod to a single call site.
 */
export interface CodemodResult {
  /** The call site that was modified */
  callSiteId: string;
  /** The original source code snippet */
  originalCode: string;
  /** The replacement source code */
  newCode: string;
  /** Whether an LLM was used for this transformation */
  usedLlm: boolean;
  /** Rationale for the change (from rule or LLM) */
  rationale: string;
  /** Self-reported confidence from LLM, or 1.0 for deterministic */
  selfConfidence: number;
}

/**
 * Result of verifying a single codemod application.
 */
export interface VerificationResult {
  /** The call site that was verified */
  callSiteId: string;
  /** Whether the TypeScript type check passed */
  typecheckPassed: boolean;
  /** Whether the test suite passed */
  testsPassed: boolean;
  /** Whether any test actually covers the modified call site */
  hasCoverage: boolean;
  /** Error messages from failed checks */
  errors: string[];
}

/**
 * Confidence score for a single migration.
 */
export interface ConfidenceScore {
  /** The call site this score applies to */
  callSiteId: string;
  /** Match component: 1.0 exact cached, 0.6 LLM-derived, scaled for arg type */
  matchScore: number;
  /** Verification component: 1.0 typecheck+tests, 0.5 typecheck-only, 0 fail */
  verificationScore: number;
  /** Historical accuracy from cache */
  historyScore: number;
  /** Final weighted confidence: C = w1*M + w2*V + w3*H */
  overall: number;
  /** Human-readable evidence checklist */
  evidence: string[];
}

/**
 * LLM rewrite request — minimal context sent to the LLM.
 */
export interface LlmRewriteRequest {
  call_site: string;
  function_sig: string;
  deprecation_note: string;
}

/**
 * LLM rewrite response — structured JSON from the LLM.
 */
export interface LlmRewriteResponse {
  new_code: string;
  rationale: string;
  self_confidence: number;
}
