# DepMigrate User Guide

This guide provides comprehensive, step-by-step instructions for installing, configuring, running, and testing **DepMigrate** on target codebases.

---

## 📋 Table of Contents
1. [Overview & Prerequisites](#1-overview--prerequisites)
2. [Setup & Installation](#2-setup--installation)
3. [Running E2E Migrations](#3-running-e2e-migrations)
    - [Dry-Run Scanning (Safe Assessment)](#dry-run-scanning-safe-assessment)
    - [Full Auto-Migration (Modifying Code)](#full-auto-migration-modifying-code)
4. [CLI Options Reference](#4-cli-options-reference)
5. [Understanding Rule Targets (Node & Expo)](#5-understanding-rule-targets-node--expo)
6. [The 7-Stage Migration Pipeline](#6-the-7-stage-migration-pipeline)
7. [Testing the Codebase](#7-testing-the-codebase)

---

## 1. Overview & Prerequisites

DepMigrate helps you modernize legacy codebases by identifying deprecated API calls and updating them. It works on:
- **Node.js**: Upgrading older `Buffer()` calls to `Buffer.alloc()` or `Buffer.from()`.
- **Expo & React Native**: Detecting deprecated package imports, property accesses (like `Constants.installationId`), and components (like `Video` from `expo-av`), recommending current standard alternatives.

### System Requirements
- **OS**: macOS, Linux, or Windows.
- **Node.js**: v18.0.0 or higher.
- **Package Manager**: npm (v9+ recommended).
- **TypeScript**: v5.0+ (if scanning TypeScript projects).

---

## 2. Setup & Installation

### Step 1: Install Dependencies
Run the following command in the project root to fetch all required libraries:
```bash
npm install
```

### Step 2: Build the Application
Compile the TypeScript source files to JavaScript:
```bash
npm run build
```
This generates the runnable JS application under the `dist/` folder.

---

## 3. Running E2E Migrations

DepMigrate can scan either a **single file** or an **entire directory**.

### Dry-Run Scanning (Safe Assessment)
Before modifying your source files, run a dry-run. This will scan your code, check the rules cache, compile reports, but **will not write any changes** to the code files.

Run this command to scan the provided Expo example file:
```bash
npx tsx src/cli.ts scan ./fixtures/demo-repo/src/test-gk.js --dry-run
```

#### Expected Terminal Output:
```text
🔍 DepMigrate — Scanning for deprecated API usage

  Target: /path/to/DepMigrate/fixtures/demo-repo/src/test-gk.js
  Mode:   Single file

━━━ Stage 1: AST Scan ━━━
  Found 8 deprecated call site(s):

    cs_001  test-gk.js:13  expo-av (package_import)
    cs_002  test-gk.js:13  expo-av.Video (component)
    cs_003  test-gk.js:14  expo-background-fetch (package_import)
    cs_004  test-gk.js:15  expo-face-detector (package_import)
    cs_005  test-gk.js:26  Constants.installationId (property)
    cs_006  test-gk.js:29  Constants.isDevice (property)
    cs_007  test-gk.js:32  Constants.nativeAppVersion (property)
    cs_008  test-gk.js:35  Constants.platform.platform (property)

━━━ Stage 2: Rules Cache Lookup ━━━
  cs_001: 📋 Manual migration → expo-video or expo-audio
  cs_002: 📋 Manual migration → expo-video
  cs_003: 📋 Manual migration → expo-background-task
  cs_004: 📋 Manual migration → react-native-vision-camera
  cs_005: 📋 Manual migration → use expo-constants with different method or generate UUID
  cs_006: 📋 Manual migration → use expo-device to detect device type
  cs_007: 📋 Manual migration → expo-application.Application.nativeAppVersion
  cs_008: 📋 Manual migration → expo-device.Device.modelId

  0 deterministic, 8 manual review, 0 LLM-required

  --dry-run: Skipping code modifications.

━━━ Report Generation ━━━
  Markdown: /path/to/DepMigrate/depmigrate-output/migration-report.md
  JSON:     /path/to/DepMigrate/depmigrate-output/migration-report.json

═══════════════════════════════════════════════════
  DEPRECATION SUMMARY
═══════════════════════════════════════════════════
...
```

---

### Full Auto-Migration (Modifying Code)
To let DepMigrate perform automatic AST modifications on files containing deterministic deprecations (like `parser.js` for `Buffer` calls):

```bash
# This will modify the files inside the target directory/file!
npx tsx src/cli.ts scan ./fixtures/demo-repo/src/parser.js
```

#### Expected Terminal Output:
```text
🔍 DepMigrate — Scanning for deprecated API usage

  Target: /path/to/DepMigrate/fixtures/demo-repo/src/parser.js
  Mode:   Single file

━━━ Stage 1: AST Scan ━━━
  Found 4 deprecated call site(s):
  ...
━━━ Stage 4: Apply Codemods ━━━
  cs_001: ✓ Deterministic → Buffer.alloc(16)
  cs_002: ✓ Deterministic → Buffer.from("hello world")
  cs_003: ✓ Deterministic → Buffer.from(bytes)
  cs_004: ⚡ LLM → Buffer.from(userInput)
  ...
```

---

## 4. CLI Options Reference

The `scan` command supports multiple options to customize execution:

| Flag | Long Option | Description | Example |
|---|---|---|---|
| `-o` | `--output <dir>` | Directory where the JSON/Markdown reports are saved | `--output ./reports` |
| | `--dry-run` | Analyzes code but leaves file contents untouched | `--dry-run` |
| | `--api-key <key>` | Sets the Anthropic SDK key (instead of the environment variable) | `--api-key sk-ant-...` |
| | `--db <path>` | Sets path to a custom SQLite rules DB | `--db my-rules.db` |

---

## 5. Understanding Rule Targets (Node & Expo)

DepMigrate's SQLite rules database is seeded automatically from `src/rules/seedRules.json` on the first execution.

- **Deterministic rules (`transformType: "deterministic"`)**: Replaced automatically. E.g., `Buffer` constructs.
- **LLM rules (`transformType: "requires_llm"`)**: Forwarded to Claude with code boundary context for rewriting.
- **Manual rules (`transformType: "manual"`)**: Flags usages that must be reviewed manually (such as package migrations requiring configuration changes or alternate package installation).

To confirm a successful LLM transformation and save it as a deterministic rule, run:
```bash
npx tsx src/cli.ts confirm cs_004
```

---

## 6. The 7-Stage Migration Pipeline

For every run, DepMigrate executes:
1. **Scan**: Traverses code AST via `ts-morph` and extracts deprecated targets.
2. **Rules Cache Lookup**: Queries the internal SQLite cache for existing matching transformations.
3. **Execution Planning**: Builds an optimal order of application to avoid rewriting overlaps.
4. **Deterministic & LLM Applier**: Rewrites code segments with AST updates.
5. **Semantic Validation**: Diff checker verifies syntax trees to ensure no external logic was changed.
6. **Type & Test Verification**: Executes typechecks and the test suite on the mutated files.
7. **Scoring & Reporting**: Grades overall confidence and publishes reports in `.json` and `.md`.

---

## 7. Testing the Codebase

DepMigrate has a high-coverage test suite using Vitest.

### Run All Unit and Integration Tests
```bash
npm test
```

### Run Tests in Watch Mode
For interactive development, run:
```bash
npm run test:watch
```
All 44 test cases spanning CLI flags, AST classification, SQLite rules databases, and report generator configurations will be executed.
