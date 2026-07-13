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

---

## 💻 CLI Commands

Run the CLI using `npx tsx src/cli.ts` (development) or built scripts via `node dist/cli.js`.

### 1. Scan and Migrate (`scan`)
Scan a directory or file, find deprecations, apply deterministic or LLM-assisted changes, and run validations.
```bash
# Scan a directory or single file (Dry Run - Recommended first step)
npx tsx src/cli.ts scan ./fixtures/demo-repo/src/test-gk.js --dry-run

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
├── tests/                   # 100% covered Vitest unit and integration suites
└── fixtures/
    └── demo-repo/           # Reference code targets (parser.js, test-gk.js)
```

---

## 🧪 Testing and Verification

Run the test suite using Vitest:
```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

The test coverage spans across scanner classification, execution sorting, rules caching, typecheck/test runners, semantic diff validation, and cli command executions.

---

## 📖 Detailed Instructions

For detailed walkthroughs, commands, flags, and expected terminal outputs, please refer to the [guide.md](./guide.md) file.
