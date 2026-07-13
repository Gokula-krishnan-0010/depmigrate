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
  .description("Scan a directory or file for deprecated API usage and apply migrations")
  .argument("<target>", "Path to the target project directory or file")
  .option("-o, --output <dir>", "Output directory for reports", "./depmigrate-output")
  .option("--dry-run", "Scan only, do not apply changes")
  .option("--api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .option("--db <path>", "Path to the rules database")
  .action(async (target: string, options: any) => {
    const targetPath = path.resolve(target);

    if (!fs.existsSync(targetPath)) {
      console.error(`Error: Target not found: ${targetPath}`);
      process.exit(1);
    }

    const isFile = fs.statSync(targetPath).isFile();
    const targetDir = isFile ? path.dirname(targetPath) : targetPath;

    console.log("\n🔍 DepMigrate — Scanning for deprecated API usage\n");
    console.log(`  Target: ${targetPath}`);
    console.log(`  Mode:   ${isFile ? "Single file" : "Directory"}`);
    console.log("");

    // Stage 1: Scan
    console.log("━━━ Stage 1: AST Scan ━━━");
    const callSites = scanDirectory(targetPath);
    console.log(`  Found ${callSites.length} deprecated call site(s):\n`);
    for (const cs of callSites) {
      console.log(`    ${cs.id}  ${cs.file}:${cs.line}  ${cs.symbol} (${cs.argType})`);
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
    const manualSites: CallSite[] = [];
    const unmatchedSites: CallSite[] = [];

    for (const cs of callSites) {
      const rule = rulesCache.lookup(cs.symbol, cs.argType);
      if (rule) {
        matchedRules.set(cs.id, rule);
        if (rule.transformType === "manual") {
          manualSites.push(cs);
          console.log(`  ${cs.id}: 📋 Manual migration → ${rule.newExpression}`);
        } else if (rule.transformType === "deterministic") {
          console.log(`  ${cs.id}: ✓ Deterministic rule → ${rule.newExpression}`);
        } else {
          unmatchedSites.push(cs);
          console.log(`  ${cs.id}: ⚡ Requires LLM → ${rule.newExpression}`);
        }
      } else {
        unmatchedSites.push(cs);
        console.log(`  ${cs.id}: ✗ No rule → routed to LLM`);
      }
    }

    const deterministicCount = [...matchedRules.values()].filter(r => r.transformType === "deterministic").length;
    console.log(
      `\n  ${deterministicCount} deterministic, ${manualSites.length} manual review, ${unmatchedSites.length} LLM-required\n`
    );

    // Separate call sites by type
    const deterministicSites = callSites.filter(cs => {
      const rule = matchedRules.get(cs.id);
      return rule && rule.transformType === "deterministic";
    });
    const llmSites = unmatchedSites;

    // Build codemods for manual sites (report-only, no file changes)
    const manualCodemods: CodemodResult[] = manualSites.map(cs => {
      const rule = matchedRules.get(cs.id)!;
      return {
        callSiteId: cs.id,
        originalCode: cs.snippet || `${cs.symbol} (line ${cs.line})`,
        newCode: rule.newExpression,
        usedLlm: false,
        rationale: `Manual migration required (${rule.source}): Replace ${cs.symbol} with ${rule.newExpression}`,
        selfConfidence: 1.0,
      };
    });

    if (options.dryRun) {
      // In dry-run mode, generate report with manual items only
      console.log("  --dry-run: Skipping code modifications.\n");

      // Build verification stubs for manual items
      const manualVerifications: VerificationResult[] = manualCodemods.map(cm => ({
        callSiteId: cm.callSiteId,
        typecheckPassed: true,
        testsPassed: true,
        hasCoverage: false,
        errors: [],
      }));

      const manualScores: ConfidenceScore[] = manualCodemods.map(cm => {
        const rule = matchedRules.get(cm.callSiteId) || null;
        return {
          callSiteId: cm.callSiteId,
          matchScore: 1.0,
          verificationScore: 0.5, // Not yet verified
          historyScore: rule?.confidenceHistory ?? 0,
          overall: 0.5 + 0.2 * (rule?.confidenceHistory ?? 0),
          evidence: [
            "[📋] Manual migration required",
            `[✓] Rule source: ${rule?.source || "Unknown"}`,
            `[✓] Replacement: ${rule?.newExpression || "Unknown"}`,
            rule && rule.confidenceHistory > 0
              ? `[✓] Historical confidence: ${(rule.confidenceHistory * 100).toFixed(0)}%`
              : "[⚠] No historical data",
          ],
        };
      });

      // Generate report
      console.log("━━━ Report Generation ━━━");
      const reportData = {
        scanTarget: targetPath,
        timestamp: new Date().toISOString(),
        callSites,
        codemods: manualCodemods,
        verifications: manualVerifications,
        scores: manualScores,
      };

      const { markdownPath, jsonPath } = generateReport(reportData, options.output);
      console.log(`  Markdown: ${markdownPath}`);
      console.log(`  JSON:     ${jsonPath}`);
      console.log("");

      // Print summary
      printFinalSummary(callSites, manualCodemods, manualScores, matchedRules);

      rulesCache.close();
      return;
    }

    // Stage 3: Plan execution order (only for deterministic + LLM sites)
    const codeSites = [...deterministicSites, ...llmSites];
    if (codeSites.length > 0) {
      console.log("━━━ Stage 3: Execution Planning ━━━");
      const ordered = planExecutionOrder(codeSites);
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
      const autoCodemods: CodemodResult[] = [];
      let llmCallCount = 0;

      for (const cs of ordered) {
        const rule = matchedRules.get(cs.id);
        try {
          if (rule && rule.transformType === "deterministic") {
            const result = applyDeterministicCodemod(cs, rule, targetDir);
            autoCodemods.push(result);
            console.log(`  ${cs.id}: ✓ Deterministic → ${result.newCode}`);
          } else {
            llmCallCount++;
            const result = await applyLlmRewrite(cs, targetDir, options.apiKey);
            autoCodemods.push(result);
            console.log(
              `  ${cs.id}: ⚡ LLM → ${result.newCode} (confidence: ${(result.selfConfidence * 100).toFixed(0)}%)`
            );
          }
        } catch (err: any) {
          console.error(`  ${cs.id}: ✗ Error: ${err.message}`);
        }
      }

      console.log(
        `\n  LLM calls made: ${llmCallCount} (deterministic: ${autoCodemods.length - llmCallCount})\n`
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

      const autoVerifications: VerificationResult[] = autoCodemods.map((cm) => ({
        callSiteId: cm.callSiteId,
        typecheckPassed: typecheckResult.passed,
        testsPassed: testResult.passed,
        hasCoverage: testResult.hasCoverage,
        errors: [...typecheckResult.errors, ...testResult.errors],
      }));

      // Stage 6: Confidence scoring
      console.log("━━━ Stage 6: Confidence Scoring ━━━");
      const autoScores: ConfidenceScore[] = [];
      for (const cm of autoCodemods) {
        const verification = autoVerifications.find(v => v.callSiteId === cm.callSiteId)!;
        const rule = matchedRules.get(cm.callSiteId) || null;
        const score = calculateConfidence(cm, verification, rule);
        autoScores.push(score);

        const icon = score.overall >= 0.5 ? "✓" : "⚠";
        console.log(`  ${cm.callSiteId}: ${icon} ${(score.overall * 100).toFixed(0)}%`);
        for (const e of score.evidence) {
          console.log(`    ${e}`);
        }
      }

      // Also score manual items
      const manualVerifications: VerificationResult[] = manualCodemods.map(cm => ({
        callSiteId: cm.callSiteId,
        typecheckPassed: true,
        testsPassed: true,
        hasCoverage: false,
        errors: [],
      }));

      const manualScores: ConfidenceScore[] = manualCodemods.map(cm => {
        const rule = matchedRules.get(cm.callSiteId) || null;
        return {
          callSiteId: cm.callSiteId,
          matchScore: 1.0,
          verificationScore: 0.5,
          historyScore: rule?.confidenceHistory ?? 0,
          overall: 0.5 + 0.2 * (rule?.confidenceHistory ?? 0),
          evidence: [
            "[📋] Manual migration required",
            `[✓] Rule source: ${rule?.source || "Unknown"}`,
            `[✓] Replacement: ${rule?.newExpression || "Unknown"}`,
            rule && rule.confidenceHistory > 0
              ? `[✓] Historical confidence: ${(rule.confidenceHistory * 100).toFixed(0)}%`
              : "[⚠] No historical data",
          ],
        };
      });

      for (const score of manualScores) {
        console.log(`  ${score.callSiteId}: 📋 Manual review needed`);
        for (const e of score.evidence) {
          console.log(`    ${e}`);
        }
      }
      console.log("");

      // Combine all results
      const allCodemods = [...autoCodemods, ...manualCodemods];
      const allVerifications = [...autoVerifications, ...manualVerifications];
      const allScores = [...autoScores, ...manualScores];

      // Stage 7: Report
      console.log("━━━ Stage 7: Report Generation ━━━");
      const reportData = {
        scanTarget: targetPath,
        timestamp: new Date().toISOString(),
        callSites,
        codemods: allCodemods,
        verifications: allVerifications,
        scores: allScores,
      };

      const { markdownPath, jsonPath } = generateReport(reportData, options.output);
      console.log(`  Markdown: ${markdownPath}`);
      console.log(`  JSON:     ${jsonPath}`);
      console.log("");

      printFinalSummary(callSites, allCodemods, allScores, matchedRules);

    } else {
      // Only manual sites — generate report without code modifications
      console.log("━━━ All deprecations require manual migration ━━━\n");

      const manualVerifications: VerificationResult[] = manualCodemods.map(cm => ({
        callSiteId: cm.callSiteId,
        typecheckPassed: true,
        testsPassed: true,
        hasCoverage: false,
        errors: [],
      }));

      const manualScores: ConfidenceScore[] = manualCodemods.map(cm => {
        const rule = matchedRules.get(cm.callSiteId) || null;
        return {
          callSiteId: cm.callSiteId,
          matchScore: 1.0,
          verificationScore: 0.5,
          historyScore: rule?.confidenceHistory ?? 0,
          overall: 0.5 + 0.2 * (rule?.confidenceHistory ?? 0),
          evidence: [
            "[📋] Manual migration required",
            `[✓] Rule source: ${rule?.source || "Unknown"}`,
            `[✓] Replacement: ${rule?.newExpression || "Unknown"}`,
            rule && rule.confidenceHistory > 0
              ? `[✓] Historical confidence: ${(rule.confidenceHistory * 100).toFixed(0)}%`
              : "[⚠] No historical data",
          ],
        };
      });

      console.log("━━━ Report Generation ━━━");
      const reportData = {
        scanTarget: targetPath,
        timestamp: new Date().toISOString(),
        callSites,
        codemods: manualCodemods,
        verifications: manualVerifications,
        scores: manualScores,
      };

      const { markdownPath, jsonPath } = generateReport(reportData, options.output);
      console.log(`  Markdown: ${markdownPath}`);
      console.log(`  JSON:     ${jsonPath}`);
      console.log("");

      printFinalSummary(callSites, manualCodemods, manualScores, matchedRules);
    }

    rulesCache.close();
  });

/**
 * Print the final summary to stdout.
 */
function printFinalSummary(
  callSites: CallSite[],
  codemods: CodemodResult[],
  scores: ConfidenceScore[],
  matchedRules: Map<string, RuleCacheEntry>
) {
  console.log("═══════════════════════════════════════════════════");
  console.log("  DEPRECATION SUMMARY");
  console.log("═══════════════════════════════════════════════════\n");

  // Group by deprecation source
  const bySource = new Map<string, { cs: CallSite; rule: RuleCacheEntry | undefined; cm: CodemodResult | undefined }[]>();
  for (const cs of callSites) {
    const rule = matchedRules.get(cs.id);
    const cm = codemods.find(c => c.callSiteId === cs.id);
    const source = rule?.source || "Unknown";
    const existing = bySource.get(source) || [];
    existing.push({ cs, rule, cm });
    bySource.set(source, existing);
  }

  for (const [source, items] of bySource) {
    console.log(`  📦 ${source}`);
    for (const { cs, rule, cm } of items) {
      const replacement = rule?.newExpression || cm?.newCode || "Unknown";
      const type = rule?.transformType === "manual" ? "📋 Manual" :
                   rule?.transformType === "deterministic" ? "✓ Auto" : "⚡ LLM";
      console.log(`    ${type}  ${cs.symbol} → ${replacement}`);
      console.log(`         at ${cs.file}:${cs.line}`);
      if (cs.snippet) {
        console.log(`         snippet: ${cs.snippet.substring(0, 80)}${cs.snippet.length > 80 ? "..." : ""}`);
      }
    }
    console.log("");
  }

  // Overall stats
  const manualCount = codemods.filter(c => {
    const rule = matchedRules.get(c.callSiteId);
    return rule?.transformType === "manual";
  }).length;
  const autoCount = codemods.filter(c => !c.usedLlm && !(matchedRules.get(c.callSiteId)?.transformType === "manual")).length;
  const llmCount = codemods.filter(c => c.usedLlm).length;

  console.log(`  Total deprecations found: ${callSites.length}`);
  console.log(`  Auto-fixed:              ${autoCount}`);
  console.log(`  Manual review needed:    ${manualCount}`);
  console.log(`  LLM-assisted:            ${llmCount}`);
  console.log("");
}

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

    const newExpression = generalizeReplacement(codemod.newCode, callSite);

    const rulesCache = new RulesCache(options.db);
    const entry: RuleCacheEntry = {
      symbol: callSite.symbol,
      argType: callSite.argType,
      newExpression,
      transformType: "deterministic",
      source: `Confirmed LLM migration (${id})`,
      confidenceHistory: 0.7,
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
  const fromMatch = newCode.match(/Buffer\.from\(([^)]*)\)/);
  if (fromMatch) return "Buffer.from({0})";

  const allocMatch = newCode.match(/Buffer\.alloc\(([^)]*)\)/);
  if (allocMatch) return "Buffer.alloc({0})";

  const allocUnsafeMatch = newCode.match(/Buffer\.allocUnsafe\(([^)]*)\)/);
  if (allocUnsafeMatch) return "Buffer.allocUnsafe({0})";

  return newCode;
}

program.parse();
