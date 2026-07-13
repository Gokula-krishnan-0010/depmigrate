```text
██████╗ ███████╗██████╗ ███╗   ███╗██╗ ██████╗ ██████╗  █████╗ ████████╗███████╗
██╔══██╗██╔════╝██╔══██╗████╗ ████║██║██╔════╝ ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝
██║  ██║█████╗  ██████╔╝██╔████╔██║██║██║  ███╗██████╔╝███████║   ██║   █████╗
██║  ██║██╔══╝  ██╔═══╝ ██║╚██╔╝██║██║██║   ██║██╔══██╗██╔══██║   ██║   ██╔══╝
██████╔╝███████╗██║     ██║ ╚═╝ ██║██║╚██████╔╝██║  ██║██║  ██║   ██║   ███████╗
╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

A robust CLI tool designed to automate the detection and migration of deprecated API usage within codebases. By combining deterministic AST-based transformations with advanced LLM-assisted rewriting, DepMigrate ensures safe, context-aware dependency updates with high confidence scores.

## 🚀 Features

- **Multi-Stage Pipeline**: Integrates AST scanning, rules cache lookup, deterministic transformation, LLM rewriting, semantic diff analysis, and comprehensive verification.
- **Hybrid Transformation Engine**:
  - **Deterministic**: Pattern-based replacements for stable API migrations.
  - **LLM-Assisted**: Smart rewriting for complex API updates using Claude models.
- **Semantic Validation**:
  - **Semantic Diff**: Detects non-API surface changes between original and migrated code.
  - **Typechecking**: Runs `tsc` to ensure type correctness.
  - **Test Execution**: Runs test suites via `npm test` to validate behavior.
- **Confidence Scoring**: Calculates migration confidence based on:
  - AST pattern match depth
  - LLM self-assessment
  - Typecheck status
  - Test pass/fail
  - Semantic stability
- **Rules Cache**: Persistent SQLite database (`rules.db`) to cache API mappings and optimize deterministic transformations.
- **Rich Output**: Generates detailed migration reports with call site analysis, confidence scores, and verification results.

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd DepMigrate

# Install dependencies
npm install

# Build the project (if TypeScript is used)
npm run build
```

## 💻 Usage

The primary command is `depmigrate scan`, which executes the end-to-end migration pipeline.

### Basic Usage

```bash
npx depmigrate scan <target-directory>
```

**Example:**

```bash
npx depmigrate scan ./src
```

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output directory for reports | `./depmigrate-output` |
| `--dry-run` | Scan only, do not apply changes | `false` |
| `--api-key <key>` | API key for LLM operations | `ANTHROPIC_API_KEY` env var |
| `--db <path>` | Path to rules database | `./rules.db` |

### Example Workflow

```bash
# Scan and apply migrations
npx depmigrate scan ./my-project

# Dry run for review
npx depmigrate scan ./my-project --dry-run

# Use custom output directory
npx depmigrate scan ./my-project --output ./migrations/2026-07-14

# Provide API key via env var (recommended)
ANTHROPIC_API_KEY='your-api-key' npx depmigrate scan ./my-project
```

## 📁 Project Structure

```
src/
├── astScan/           # AST-based call site detection
│   └── astScanner.ts
├── codemod/           # Codemod application logic
│   ├── deterministicApplier.ts
│   └── llmRewriter.ts
├── rules/             # Rule management and caching
│   ├── rulesCache.ts
│   └── types.ts
├── plan/              # Execution planning
│   └── executionOrder.ts
├── verify/            # Verification utilities
│   ├── typecheck.ts
│   └── testRunner.ts
├── diff/              # Semantic diff analysis
│   └── semanticDiff.ts
└── report/            # Report generation
    └── reportGenerator.ts
```

## 🧪 Verification Pipeline

The tool follows a rigorous verification process:

1. **Scan**: Identifies deprecated API calls
2. **Rule Lookup**: Matches against deterministic rules
3. **Codemod Application**: Applies deterministic or LLM-assisted changes
4. **Semantic Diff**: Validates that only API surface was modified
5. **Typecheck**: Runs `tsc` to ensure type correctness
6. **Tests**: Executes `npm test` to verify behavior

## 📊 Output

The tool generates detailed reports in the specified output directory, including:

- **Call site analysis**: List of all detected deprecated calls
- **Rule matching**: Which calls used deterministic rules vs. LLM
- **Confidence scores**: Per-migration and overall confidence
- **Verification results**: Typecheck and test outcomes
- **Semantic diff**: Detected non-API changes

## 🛠️ Development

### Adding New Rules

To add deterministic migration rules, update the `RULES` map in `src/rules/rulesCache.ts`. The map uses a composite key of `symbol + "|" + argType`.

**Example:**

```typescript
const RULES: Record<string, RuleCacheEntry> = {
  "oldMethod|string": {
    symbol: "oldMethod",
    argType: "string",
    transformType: "deterministic",
    newExpression: "newMethod",
    description: "Replaces oldMethod with newMethod for string arguments"
  }
};
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
```
