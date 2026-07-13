#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { scanDirectory } from "./scan/astScanner.js";
import { RulesCache } from "./rules/rulesCache.js";
import { planExecutionOrder } from "./plan/executionOrder.js";
import { applyDeterministicCodemod } from "./codemod/deterministicApplier.js";
import { applyLlmRewrite } from "./codemod/llmRewriter.js";
import { semanticDiff } from "./diff/semanticDiff.js";
import { runTypecheck } from "./verify/typecheck.js";
import { runTests } from "./verify/testRunner.js";
import { calculateConfidence } from "./score/confidenceScorer.js";
import { generateReport } from "./report/reportGenerator.js";
import type {
  CallSite,
  CodemodResult,
  VerificationResult,
  ConfidenceScore,
  RuleCacheEntry,
} from "./scan/types.js";

const program = new Command();

program
  .name("depmigrate")
  .description(
    "Detect deprecated API usage and produce verified, confidence-scored code migrations."
  )
  .version("0.1.0");

program
  .command("scan")
  .description("Scan a directory for deprecated API usage and apply migrations")
  .argument("<target>", "Path to the target project directory")
  .option("-o, --output <dir>", "Output directory for reports", "./depmigrate-output")
  .option("--dry-run", "Scan only, do not apply changes")
  .option("--api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .option("--db <path>", "Path to the rules database")
  .action(async (target: string, options: any) => {
    const targetDir = path.resolve(target);

    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Target directory not found: ${targetDir}`);
      process.exit(1);
    }

    console.log("\n🔍 DepMigrate — Scanning for deprecated API usage\n");
    console.log(`  Target: ${targetDir}`);
    console.log("");

    // Stage 1: Scan
    console.log("━━━ Stage 1: AST Scan ━━━");
    const callSites = scanDirectory(targetDir);
    console.log(`  Found ${callSites.length} deprecated call site(s):\n`);
    for (const cs of callSites) {
      console.log(`    ${cs.id}  ${cs.file}:${cs.line}  ${cs.symbol}(${cs.argType})`);
    }
    console.log("");

    if (callSites.length === 0) {
      console.log("  ✓ No deprecated API usage found. Exiting.");
      return;
    }

    // Stage 2: Rules cache lookup
    console.log("━━━ Stage 2: Rules Cache Lookup ━━━");
    const rulesCache = new RulesCache(options.db);
    const matchedRules = new Map<string, RuleCacheEntry>();
    const unmatchedSites: CallSite[] = [];

    for (const cs of callSites) {
      const rule = rulesCache.lookup(cs.symbol, cs.argType);
      if (rule && rule.transformType === "deterministic") {
        matchedRules.set(cs.id, rule);
        console.log(`  ${cs.id}: ✓ Matched rule → ${rule.newExpression}`);
      } else {
        unmatchedSites.push(cs);
        console.log(`  ${cs.id}: ✗ No rule → routed to LLM`);
      }
    }
    console.log(
      `\n  ${matchedRules.size} deterministic, ${unmatchedSites.length} LLM-required\n`
    );

    if (options.dryRun) {
      console.log("  --dry-run: Skipping code modifications.");
      rulesCache.close();
      return;
    }

    // Stage 3: Plan execution order
    console.log("━━━ Stage 3: Execution Planning ━━━");
    const ordered = planExecutionOrder(callSites);
    console.log(
      `  Execution order: ${ordered.map((cs) => cs.id).join(" → ")}\n`
    );

    // Snapshot original files for semantic diff
    const originalFiles = new Map<string, string>();
    for (const cs of ordered) {
      const absPath = path.resolve(targetDir, cs.file);
      if (!originalFiles.has(cs.file)) {
        originalFiles.set(cs.file, fs.readFileSync(absPath, "utf-8"));
      }
    }

    // Stage 4: Apply codemods
    console.log("━━━ Stage 4: Apply Codemods ━━━");
    const codemods: CodemodResult[] = [];
    let llmCallCount = 0;

    for (const cs of ordered) {
      const rule = matchedRules.get(cs.id);
      try {
        if (rule) {
          // Stage 4a: Deterministic
          const result = applyDeterministicCodemod(cs, rule, targetDir);
          codemods.push(result);
          console.log(`  ${cs.id}: ✓ Deterministic → ${result.newCode}`);
        } else {
          // Stage 4b: LLM-assisted
          llmCallCount++;
          const result = await applyLlmRewrite(
            cs,
            targetDir,
            options.apiKey
          );
          codemods.push(result);
          console.log(
            `  ${cs.id}: ⚡ LLM → ${result.newCode} (confidence: ${(result.selfConfidence * 100).toFixed(0)}%)`
          );
        }
      } catch (err: any) {
        console.error(`  ${cs.id}: ✗ Error: ${err.message}`);
      }
    }

    console.log(
      `\n  LLM calls made: ${llmCallCount} (deterministic: ${codemods.length - llmCallCount})\n`
    );

    // Semantic diff check
    console.log("━━━ Stage 4.5: Semantic Diff ━━━");
    for (const [file, origContent] of originalFiles) {
      const absPath = path.resolve(targetDir, file);
      const newContent = fs.readFileSync(absPath, "utf-8");
      const diff = semanticDiff(origContent, newContent, file);
      if (diff.onlyApiSurfaceModified) {
        console.log(`  ${file}: ✓ Only API surface modified`);
      } else {
        console.log(`  ${file}: ⚠ Non-API changes detected:`);
        for (const change of diff.changes) {
          console.log(`    - ${change}`);
        }
      }
    }
    console.log("");

    // Stage 5: Verify
    console.log("━━━ Stage 5: Verification ━━━");
    const typecheckResult = runTypecheck(targetDir);
    const testResult = runTests(targetDir);

    console.log(
      `  Typecheck: ${typecheckResult.passed ? "✓ passed" : "✗ failed"}`
    );
    console.log(
      `  Tests: ${testResult.passed ? "✓ passed" : "✗ failed"}`
    );
    if (testResult.hasCoverage) {
      console.log("  Coverage: ✓ tests cover the modified code");
    }
    console.log("");

    // Build per-site verification results
    const verifications: VerificationResult[] = codemods.map((cm) => ({
      callSiteId: cm.callSiteId,
      typecheckPassed: typecheckResult.passed,
      testsPassed: testResult.passed,
      hasCoverage: testResult.hasCoverage,
      errors: [
        ...typecheckResult.errors,
        ...testResult.errors,
      ],
    }));

    // Stage 6: Confidence scoring
    console.log("━━━ Stage 6: Confidence Scoring ━━━");
    const scores: ConfidenceScore[] = [];

    for (const cm of codemods) {
      const verification = verifications.find(
        (v) => v.callSiteId === cm.callSiteId
      )!;
      const rule = matchedRules.get(cm.callSiteId) || null;
      const score = calculateConfidence(cm, verification, rule);
      scores.push(score);

      const icon = score.overall >= 0.5 ? "✓" : "⚠";
      console.log(
        `  ${cm.callSiteId}: ${icon} ${(score.overall * 100).toFixed(0)}%`
      );
      for (const e of score.evidence) {
        console.log(`    ${e}`);
      }
    }
    console.log("");

    // Stage 7: Report
    console.log("━━━ Stage 7: Report Generation ━━━");
    const reportData = {
      scanTarget: targetDir,
      timestamp: new Date().toISOString(),
      callSites,
      codemods,
      verifications,
      scores,
    };

    const { markdownPath, jsonPath } = generateReport(
      reportData,
      options.output
    );
    console.log(`  Markdown: ${markdownPath}`);
    console.log(`  JSON:     ${jsonPath}`);
    console.log("");

    // Final summary
    const avg =
      scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;
    console.log(`Overall confidence: ${(avg * 100).toFixed(0)}%`);

    for (const score of scores) {
      for (const e of score.evidence) {
        console.log(e);
      }
      if (score.overall < 0.5) {
        console.log(
          `[warn] Manual review required (${score.callSiteId} — confidence below 50%)`
        );
      }
    }

    console.log("");

    rulesCache.close();
  });

program
  .command("confirm")
  .description("Confirm an LLM-derived migration and write it to the rules cache")
  .argument("<id>", "Call site ID to confirm (e.g. cs_004)")
  .option("--db <path>", "Path to the rules database")
  .option("-r, --report <path>", "Path to the JSON report", "./depmigrate-output/migration-report.json")
  .action((id: string, options: any) => {
    const reportPath = path.resolve(options.report);

    if (!fs.existsSync(reportPath)) {
      console.error(`Error: Report not found at ${reportPath}`);
      console.error("Run 'depmigrate scan' first to generate a report.");
      process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    const codemod = report.codemods.find(
      (c: CodemodResult) => c.callSiteId === id
    );

    if (!codemod) {
      console.error(`Error: Call site ${id} not found in report.`);
      process.exit(1);
    }

    if (!codemod.usedLlm) {
      console.log(
        `Call site ${id} was resolved deterministically — no confirmation needed.`
      );
      return;
    }

    const callSite = report.callSites.find(
      (cs: CallSite) => cs.id === id
    );
    if (!callSite) {
      console.error(`Error: Call site metadata for ${id} not found.`);
      process.exit(1);
    }

    // Extract the replacement template from the LLM-derived code
    // For the feedback loop, we generalize the replacement
    const newExpression = generalizeReplacement(codemod.newCode, callSite);

    const rulesCache = new RulesCache(options.db);
    const entry: RuleCacheEntry = {
      symbol: callSite.symbol,
      argType: callSite.argType,
      newExpression,
      transformType: "deterministic",
      source: `Confirmed LLM migration (${id})`,
      confidenceHistory: 0.7, // Initial confidence for confirmed LLM-derived rules
    };

    rulesCache.writeBack(entry);
    console.log(`\n✓ Rule confirmed and written to cache:`);
    console.log(`  Symbol: ${entry.symbol}`);
    console.log(`  Arg type: ${entry.argType}`);
    console.log(`  New expression: ${entry.newExpression}`);
    console.log(`  Source: ${entry.source}`);
    console.log(
      `\n  Next scan with the same pattern will resolve deterministically.`
    );

    rulesCache.close();
  });

/**
 * Generalize an LLM-derived replacement into a template.
 */
function generalizeReplacement(newCode: string, callSite: CallSite): string {
  // For Buffer replacements, extract the pattern
  const fromMatch = newCode.match(/Buffer\.from\(([^)]*)\)/);
  if (fromMatch) return "Buffer.from({0})";

  const allocMatch = newCode.match(/Buffer\.alloc\(([^)]*)\)/);
  if (allocMatch) return "Buffer.alloc({0})";

  const allocUnsafeMatch = newCode.match(/Buffer\.allocUnsafe\(([^)]*)\)/);
  if (allocUnsafeMatch) return "Buffer.allocUnsafe({0})";

  // Fallback: return as-is
  return newCode;
}

program.parse();
