# DepMigrate

```text
██████╗ ███████╗██████╗ ███╗   ███╗██╗ ██████╗ ██████╗  █████╗ ████████╗███████╗
██╔══██╗██╔════╝██╔══██╗████╗ ████║██║██╔════╝ ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝
██║  ██║█████╗  ██████╔╝██╔████╔██║██║██║  ███╗██████╔╝███████║   ██║   █████╗  
██║  ██║██╔══╝  ██╔═══╝ ██║╚██╔╝██║██║██║   ██║██╔══██╗██╔══██║   ██║   ██╔══╝  
██████╔╝███████╗██║     ██║ ╚═╝ ██║██║╚██████╔╝██║  ██║██║  ██║   ██║   ███████╗
╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

**DepMigrate** is a high-reliability, AST-powered CLI migration assistant designed to detect and upgrade deprecated API usages in your JavaScript and TypeScript codebases. 

Today, several AI coding assistants and dependency management tools already exist. However, each solves only a portion of the software migration problem. The core problem is using an LLM to do a job that's 80% deterministic—and every token spent re-deriving a known migration rule is a token you don't have for the 20% that genuinely needs judgment. LLM calls only happen where ambiguity is real.

DepMigrate combines exact AST pattern matching, a SQLite rules cache, safe deterministic syntax modifications, typechecking/testing validation loops, and LLM-assisted re-writing into an explainable trust layer. It supports Node.js (e.g., `Buffer` construct deprecations) and a comprehensive set of Expo / React Native API and import updates.

---

## 🚀 Features

- **AST-Based Precision Scanning**: Powered by `ts-morph` to identify precise call sites, import declarations, JSX components, and property accesses (no regular expression guessing).
- **Hybrid Transformation Engine**:
  - **Deterministic**: Instant, type-safe replacements for stable mappings (e.g., `new Buffer(x)` ➔ `Buffer.from(x)`).
  - **LLM-Assisted Rewriting**: Claude (Anthropic API) integration for ambiguous or structurally complex migrations.
  - **Manual Guidance Reporting**: Reports and groups deprecated dependencies that cannot be safely automated (e.g., Expo package changes requiring manual setup).
- **Dual-Mode Target Support**: Supports scanning entire project directories or targeting a single source file directly.
- **Verification Loop**: 
  - Validates AST transformations using semantic diffs to ensure only API boundaries are changed.
  - Runs typechecks (`tsc --noEmit`) and project tests (`vitest` or `npm test`) on applied changes.
- **Explainable Confidence Scorer**: Scores migrations dynamically based on matching type, verification status, and historical accuracy.
- **Feedback & Rule Learning**: Write confirmed LLM migrations back to the persistent SQLite rules cache via `confirm` commands.

---

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- Optional: Anthropic API Key (`ANTHROPIC_API_KEY`) for LLM-assisted migrations

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Gokula-krishnan-0010/depmigrate.git
   cd depmigrate
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the source code:
   ```bash
   npm run build
   ```
4. (Optional) Verify the setup by running the test suite:
   ```bash
   npm test
   ```
   All 44 tests should pass (see below).

---

## 🧪 Testing Commands & Examples

### 1. Verification & Test Suite
Executes the full suite of unit and integration tests covering scanning, rules lookup, planning, scoring, and verification.

```bash
# Run all tests once
npm test

# Run tests with live watch mode
npm run test:watch

# Run linter / typecheck verification on source code
npm run lint
```

Expected result:

```text
 Test Files  10 passed (10)
      Tests  44 passed (44)
```

### 2. Scanning Codebases (CLI Examples)

All examples build on the demo fixtures in `fixtures/demo-repo/`. In particular, `src/parser.js` intentionally contains four deprecated Node `Buffer()` call sites (DEP0005): a numeric literal, a string literal, a locally-inferred array, and an unresolvable parameter.

#### Dry-run scan on a single file (safe execution)
Scans `parser.js` and compiles reports without modifying the file.

```bash
node dist/cli.js scan ./fixtures/demo-repo/src/parser.js --dry-run
```

```text
🔍 DepMigrate — Scanning for deprecated API usage

  Target: /path/to/DepMigrate/fixtures/demo-repo/src/parser.js
  Mode:   Single file

━━━ Stage 1: AST Scan ━━━
  Found 4 deprecated call site(s):

    cs_001  parser.js:13  Buffer (number_literal)
    cs_002  parser.js:20  Buffer (string_literal)
    cs_003  parser.js:27  Buffer (array_local_inferred)
    cs_004  parser.js:33  Buffer (unresolvable)

━━━ Stage 2: Rules Cache Lookup ━━━
  cs_001: ✓ Deterministic rule → Buffer.alloc({0})
  cs_002: ✓ Deterministic rule → Buffer.from({0})
  cs_003: ✓ Deterministic rule → Buffer.from({0})
  cs_004: ✗ No rule → routed to LLM

  3 deterministic, 0 manual review, 1 LLM-required

  --dry-run: Skipping code modifications.

━━━ Report Generation ━━━
  Markdown: /path/to/DepMigrate/depmigrate-output/migration-report.md
  JSON:     /path/to/DepMigrate/depmigrate-output/migration-report.json

═══════════════════════════════════════════════════
  DEPRECATION SUMMARY
═══════════════════════════════════════════════════

  📦 Node DEP0005
    ✓ Auto  Buffer → Buffer.alloc({0})
         at parser.js:13
         snippet: const buf = new Buffer(16);
    ✓ Auto  Buffer → Buffer.from({0})
         at parser.js:20
         snippet: const greeting = new Buffer("hello world");
    ✓ Auto  Buffer → Buffer.from({0})
         at parser.js:27
         snippet: const buf = new Buffer(bytes);

  📦 Unknown
    ⚡ LLM  Buffer → Unknown
         at parser.js:33
         snippet: return new Buffer(userInput);
```

#### Run auto-migrations (modifies files)
Applies deterministic AST updates in place. Three sites are rewritten with zero LLM calls; the unresolvable site is routed to the LLM-assisted path.

```bash
node dist/cli.js scan ./fixtures/demo-repo/src/parser.js
```

```text
━━━ Stage 1: AST Scan ━━━
  Found 4 deprecated call site(s):

    cs_001  parser.js:13  Buffer (number_literal)
    cs_002  parser.js:20  Buffer (string_literal)
    cs_003  parser.js:27  Buffer (array_local_inferred)
    cs_004  parser.js:33  Buffer (unresolvable)

━━━ Stage 2: Rules Cache Lookup ━━━
  cs_001: ✓ Deterministic rule → Buffer.alloc({0})
  cs_002: ✓ Deterministic rule → Buffer.from({0})
  cs_003: ✓ Deterministic rule → Buffer.from({0})
  cs_004: ✗ No rule → routed to LLM

  3 deterministic, 0 manual review, 1 LLM-required

━━━ Stage 3: Execution Planning ━━━
  Execution order: cs_004 → cs_003 → cs_002 → cs_001

━━━ Stage 4: Apply Codemods ━━━
  cs_004: ⚡ LLM → return Buffer.from(userInput); (confidence: 40%)
  cs_003: ✓ Deterministic → Buffer.from(bytes)
  cs_002: ✓ Deterministic → Buffer.from("hello world")
  cs_001: ✓ Deterministic → Buffer.alloc(16)

  LLM calls made: 1 (deterministic: 3)

━━━ Stage 4.5: Semantic Diff ━━━
  parser.js: ✓ Only API surface modified

━━━ Stage 5: Verification ━━━
  Typecheck: ✓ passed
  Tests: ✓ passed

━━━ Stage 6: Confidence Scoring ━━━
  cs_004: ✓ 57%
    [~] LLM-derived (self-confidence: 40%)
    [✓] Type-safe
    [✓] Tests pass
    [⚠] No test coverage for this call site
  cs_003: ✓ 98%
    [✓] Deterministic rule match
    [✓] Type-safe
    [✓] Tests pass
    [⚠] No test coverage for this call site
    [✓] Rule source: Node DEP0005
    [✓] Historical confidence: 90%
  cs_002: ✓ 100%
    [✓] Deterministic rule match
    [✓] Type-safe
    [✓] Tests pass
    [⚠] No test coverage for this call site
    [✓] Rule source: Node DEP0005
    [✓] Historical confidence: 98%
  cs_001: ✓ 99%
    [✓] Deterministic rule match
    [✓] Type-safe
    [✓] Tests pass
    [⚠] No test coverage for this call site
    [✓] Rule source: Node DEP0005
    [✓] Historical confidence: 95%

━━━ Stage 7: Report Generation ━━━
  Markdown: /path/to/DepMigrate/depmigrate-output/migration-report.md
  JSON:     /path/to/DepMigrate/depmigrate-output/migration-report.json
```

> Note: when no `ANTHROPIC_API_KEY` is set, the LLM-required site is handled by a built-in fallback rewrite (`Buffer.from(...)`, self-confidence 40%), which is why the sample above uses it.

After the run, `parser.js` contains `Buffer.alloc(16)`, `Buffer.from("hello world")`, `Buffer.from(bytes)`, and `Buffer.from(userInput)`.

#### Dry-run scan on a whole directory
Scans all `.js`, `.ts`, `.jsx` and `.tsx` files under the target directory.

```bash
node dist/cli.js scan ./fixtures/demo-repo --dry-run
```

```text
🔍 DepMigrate — Scanning for deprecated API usage

  Target: /path/to/DepMigrate/fixtures/demo-repo
  Mode:   Directory

━━━ Stage 1: AST Scan ━━━
  Found 57 deprecated call site(s):

    cs_001  src/backgroundTask.ts:2  expo-background-fetch (package_import)
    cs_002  src/parser.js:13  Buffer (number_literal)
    cs_003  src/parser.js:20  Buffer (string_literal)
    cs_004  src/parser.js:27  Buffer (array_local_inferred)
    cs_005  src/parser.js:33  Buffer (unresolvable)
    cs_006  src/test-both.js:14  expo-av (package_import)
    ...
```

#### Comprehensive Expo / React Native fixture
`src/test.js` mixes deterministic property migrations, manual package migrations, and Node `Buffer()` cases (both deterministic and LLM-assisted).

```bash
node dist/cli.js scan ./fixtures/demo-repo/src/test.js --dry-run
```

```text
━━━ Stage 1: AST Scan ━━━
  Found 29 deprecated call site(s):

    cs_001  test.js:25  expo-av (package_import)
    cs_002  test.js:25  expo-av.Video (component)
    cs_003  test.js:25  expo-av.Audio (api)
    cs_009  test.js:76  Constants.manifest (property)
    ...
    cs_019  test.js:128  Constants.installationId (property)
    cs_025  test.js:57  Buffer (number_literal)
    cs_028  test.js:160  Buffer (unresolvable)

━━━ Stage 2: Rules Cache Lookup ━━━
  cs_001: 📋 Manual migration → expo-video or expo-audio
  ...
  cs_009: ✓ Deterministic rule → Constants.expoConfig
  ...
  cs_028: ✗ No rule → routed to LLM

  13 deterministic, 14 manual review, 2 LLM-required

  --dry-run: Skipping code modifications.
```

#### Customizing the SQLite DB and output location
Configure where reports and database files are read/written.

```bash
node dist/cli.js scan ./fixtures/demo-repo/src/parser.js --dry-run \
  --output ./custom-reports --db ./my-custom-rules.db
```

---

## 💻 CLI Commands Reference

Run the CLI using `npx tsx src/cli.ts` (development) or the built scripts via `node dist/cli.js`.

### 1. Scan and Migrate (`scan`)
Scan a directory or file, find deprecations, apply deterministic or LLM-assisted changes, and run validations.

```bash
# Scan a single file without modifying it (Dry Run)
npx tsx src/cli.ts scan ./fixtures/demo-repo/src/parser.js --dry-run

# Scan and apply changes (Mutates files)
npx tsx src/cli.ts scan ./fixtures/demo-repo/src/parser.js
```

### 2. Confirm LLM Migrations (`confirm`)
Saves a verified LLM-derived migration back into the local cache so subsequent matches execute deterministically.

```bash
npx tsx src/cli.ts confirm cs_004
```

---

## 📂 Project Structure

```text
├── src/
│   ├── cli.ts               # Commander CLI orchestrator
│   ├── scan/
│   │   ├── types.ts         # Domain models (CallSite, CodemodResult, etc.)
│   │   └── astScanner.ts    # ts-morph AST scanner for Buffer and Expo
│   ├── rules/
│   │   ├── rulesCache.ts    # SQLite rules manager & seed database loader
│   │   └── seedRules.json   # Seed data for Node & Expo rules
│   ├── plan/
│   │   └── executionOrder.ts # Dependency planning/sorting per file
│   ├── codemod/
│   │   ├── deterministicApplier.ts # Deterministic AST transforms
│   │   └── llmRewriter.ts        # Claude API interface for complex re-writes
│   ├── diff/
│   │   └── semanticDiff.ts       # AST diffing for verification safety
│   ├── verify/
│   │   ├── typecheck.ts     # runs tsc typechecks
│   │   └── testRunner.ts    # runs project test suite
│   ├── score/
│   │   └── confidenceScorer.ts   # Multi-factor confidence evaluation
│   └── report/
│       └── reportGenerator.ts    # Markdown and JSON report compiler
├── tests/                   # Vitest unit and integration suites (44 tests)
└── fixtures/
    └── demo-repo/           # Reference targets (parser.js, test.js, test-both.js, test-manual.js)
```

---

## 📖 Detailed Instructions

For detailed walkthroughs, commands, flags, and expected terminal outputs, please refer to the [guide.md](./guide.md) file.
