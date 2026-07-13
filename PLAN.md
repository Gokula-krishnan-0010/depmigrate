# DepMigrate — MVP Build Prompt (Phase 0 + Phase 1)
*Paste this directly into Claude Code as the project brief, or save as `CLAUDE.md` in the repo root.*

You are scaffolding **DepMigrate**, a CLI tool that detects deprecated API usage in a codebase and produces verified, confidence-scored code migrations. Read this entire brief before writing code. Build in the stage order given — do not skip ahead or add scope from later phases.

---

## 1. Track alignment (for README/pitch framing)

This submission targets the **Developer Tools & Infrastructure** track:

> "Software that enables developers and organizations to build, deploy, and scale other software systems... developer productivity systems... tools that simplify or accelerate software development workflows."

DepMigrate is a **developer productivity system**: it sits between a dependency bump and a merge-ready PR, closing the gap where developers currently hand-migrate broken APIs with no verification. Frame the README around this, not around "AI code generation."

## 2. Product framing — read this before writing any code

DepMigrate is not "an AI agent that rewrites your code." It is a **trust layer for code migrations** — the LLM is one component among several, used only where deterministic rules can't resolve ambiguity. Every design decision should reflect this: prefer a rule lookup over an LLM call, prefer a typecheck over a guess, and never present a change without a confidence score backed by evidence.

## 3. Hard scope boundary — Phase 0 + Phase 1 only

**Build:**
- AST-based repo scanner
- Rules cache (seeded, not scraped live)
- Deterministic codemod applier
- Scoped LLM-assisted rewrite (Anthropic API, ambiguous cases only)
- Semantic diff checker
- Verification runner (typecheck + test suite)
- Confidence scorer with explainable output
- CLI report generator (markdown + JSON)

**Do NOT build** (later phases — stub or skip entirely):
- GitLab MR/PR creation or any GitLab API calls
- Chat UX, backend server, or frontend
- Autonomous merge or any auto-apply above a threshold
- Multi-language support (TypeScript/JavaScript only)
- Live scraping of changelogs/registries (rules are hand-seeded for the demo)
- Any dashboard — CLI output only

If a design decision seems to require one of these, stop and flag it rather than implementing a workaround.

## 4. Tech stack (locked — do not substitute)

| Layer | Choice |
|---|---|
| Language | TypeScript, Node 20+ |
| AST manipulation | ts-morph |
| Rules storage | SQLite (better-sqlite3) |
| LLM calls | Anthropic API (@anthropic-ai/sdk), Claude, structured JSON output |
| Verification | tsc --noEmit, vitest |
| CLI | commander |

## 5. Repository structure

```
depmigrate/
├── package.json
├── tsconfig.json
├── src/
│   ├── scan/astScanner.ts          # finds deprecated symbol call sites
│   ├── scan/types.ts               # CallSite interface
│   ├── rules/rulesCache.ts         # SQLite-backed lookup + write-back
│   ├── rules/seedRules.json        # hand-curated known rules
│   ├── plan/executionOrder.ts      # topological order: renames before dependent rewrites
│   ├── codemod/deterministicApplier.ts
│   ├── codemod/llmRewriter.ts      # scoped Anthropic calls, ambiguous cases only
│   ├── diff/semanticDiff.ts        # pre/post AST comparison
│   ├── verify/typecheck.ts
│   ├── verify/testRunner.ts
│   ├── score/confidenceScorer.ts
│   ├── report/reportGenerator.ts
│   └── cli.ts                      # orchestrates all stages in order
├── fixtures/demo-repo/             # seeded target repo for the demo
│   ├── package.json
│   └── src/parser.js
└── tests/                          # one test file per src module, mirror structure
```

## 6. Pipeline stages — exact I/O contracts

Build and test each stage independently before wiring the CLI orchestrator. Use these interfaces exactly.

**Stage 1 — Scan**
```ts
interface CallSite {
  id: string;            // "cs_001"
  file: string;
  line: number;
  symbol: string;         // "Buffer"
  argType: "number_literal" | "string_literal" | "array_local_inferred" | "unresolvable";
}
```

**Stage 2 — Rules cache lookup**
```ts
interface RuleCacheEntry {
  symbol: string;
  argType: string;
  newExpression: string;        // template, e.g. "Buffer.alloc({0})"
  transformType: "deterministic" | "requires_llm";
  source: string;                // "Node DEP0005"
  confidenceHistory: number;     // rolling average, 0 if unused
}
```
Unmatched CallSites route to the LLM path. Matched ones route to the deterministic applier.

**Stage 3 — Plan (lightweight)**
Topologically order call sites so that any rewrite depending on another (e.g. an import rename feeding a call rewrite) applies after its dependency. For the MVP fixture this can be a same-file, top-to-bottom order — implement the interface generally, don't over-engineer the algorithm.

**Stage 4a — Deterministic codemod applier**
Input: matched CallSite + RuleCacheEntry. Output: applied edit, zero LLM tokens.

**Stage 4b — LLM-assisted rewrite** — send ONLY this, never the full file:
```json
{
  "call_site": "return new Buffer(userInput);",
  "function_sig": "function wrapDynamic(userInput)",
  "deprecation_note": "Buffer() may return uninitialized memory for numeric args"
}
```
Expect structured JSON back:
```json
{ "new_code": "return Buffer.from(userInput);", "rationale": "...", "self_confidence": 0.7 }
```

**Stage 5 — Verify:** run tsc --noEmit and the fixture's test suite per touched file. Record pass/fail per call site, plus whether any test actually covers that call site (absence of coverage is itself a signal fed to scoring).

**Stage 6 — Confidence scorer**

Formula: C = w1*M + w2*V + w3*H

- M: 1.0 exact cached rule, 0.6 LLM-derived, scaled down for inferred (non-literal) argument types
- V: 1.0 typecheck+tests pass, 0.5 typecheck-only, 0 fail
- H: rolling historical accuracy from confidenceHistory, 0 if the pattern has never been cached
- Weights: default w1=0.3, w2=0.5, w3=0.2 (verification dominates until the cache has history)

**Stage 7 — Report** — render per-change evidence, not a bare number:
```
Overall confidence: 93%
[check] Type-safe
[check] Build passes
[check] Tests pass
[check] Only API surface modified
[warn] One manual review required (cs_004 — no test coverage)
```
Output both a human-readable markdown report and a machine-readable JSON file.

**Feedback loop:** once a human confirms an LLM-derived change (manually, via a --confirm cs_004 CLI flag for the demo), write it back into the rules cache as a new RuleCacheEntry with an initial confidenceHistory. This is the mechanism that makes repeat migrations cheaper — build it, it's core to the pitch.

## 7. Demo fixture — build this exact scenario

fixtures/demo-repo/src/parser.js should contain the four Node Buffer() deprecation call sites (DEP0005) used as the running example: a numeric literal, a string literal, a locally-inferred array, and an unresolvable external parameter. Seed seedRules.json with cached rules for the first three. This gives a concrete, deterministic acceptance test: 3 resolved with zero LLM calls, 1 correctly flagged for LLM + human review.

## 8. Definition of done

- [ ] depmigrate scan ./fixtures/demo-repo runs end-to-end and produces a report
- [ ] 3 of 4 call sites resolved deterministically (verify LLM was never called for these — log/assert this)
- [ ] 1 call site flagged with an LLM-derived rewrite, correct rationale, confidence < 0.5
- [ ] Report shows the explainable checklist format, not a bare score
- [ ] --confirm <id> writes a new entry to the rules cache; re-running the scan on an identical pattern resolves it deterministically (prove the feedback loop works)
- [ ] All fixture tests pass after codemods applied
- [ ] Every module has a corresponding test in tests/

## 9. Build order for the agent

Work stage by stage per Section 6, writing and running tests after each module before moving to the next. Do not write the CLI orchestrator until Stages 1-6 pass independently. Ask before making any architectural change not specified here.
