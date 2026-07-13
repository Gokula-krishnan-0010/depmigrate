import fs from "node:fs";
import path from "node:path";
import type {
  CallSite,
  CodemodResult,
  ConfidenceScore,
  VerificationResult,
} from "../scan/types.js";

export interface ReportData {
  scanTarget: string;
  timestamp: string;
  callSites: CallSite[];
  codemods: CodemodResult[];
  verifications: VerificationResult[];
  scores: ConfidenceScore[];
}

/**
 * Generate both a human-readable markdown report and a machine-readable JSON file.
 */
export function generateReport(
  data: ReportData,
  outputDir: string
): { markdownPath: string; jsonPath: string } {
  const absoluteDir = path.resolve(outputDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const markdownPath = path.join(absoluteDir, "migration-report.md");
  const jsonPath = path.join(absoluteDir, "migration-report.json");

  // Generate markdown report
  const md = buildMarkdownReport(data);
  fs.writeFileSync(markdownPath, md, "utf-8");

  // Generate JSON report
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");

  return { markdownPath, jsonPath };
}

function buildMarkdownReport(data: ReportData): string {
  const lines: string[] = [];

  // Header
  lines.push("# DepMigrate — Migration Report");
  lines.push("");
  lines.push(`**Target:** ${data.scanTarget}`);
  lines.push(`**Generated:** ${data.timestamp}`);
  lines.push(`**Call sites found:** ${data.callSites.length}`);
  lines.push(
    `**Migrations applied:** ${data.codemods.length}`
  );
  lines.push("");

  // Overall confidence
  if (data.scores.length > 0) {
    const avg =
      data.scores.reduce((sum, s) => sum + s.overall, 0) /
      data.scores.length;
    lines.push(`## Overall Confidence: ${(avg * 100).toFixed(0)}%`);
    lines.push("");
  }

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| ID | File | Line | Symbol | Arg Type | Method | Confidence |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const cs of data.callSites) {
    const codemod = data.codemods.find((c) => c.callSiteId === cs.id);
    const score = data.scores.find((s) => s.callSiteId === cs.id);
    const method = codemod
      ? codemod.usedLlm
        ? "LLM"
        : "Deterministic"
      : "—";
    const conf = score ? `${(score.overall * 100).toFixed(0)}%` : "—";
    lines.push(
      `| ${cs.id} | ${cs.file} | ${cs.line} | ${cs.symbol} | ${cs.argType} | ${method} | ${conf} |`
    );
  }
  lines.push("");

  // Per-change details
  lines.push("## Change Details");
  lines.push("");

  for (const cs of data.callSites) {
    const codemod = data.codemods.find((c) => c.callSiteId === cs.id);
    const verification = data.verifications.find(
      (v) => v.callSiteId === cs.id
    );
    const score = data.scores.find((s) => s.callSiteId === cs.id);

    lines.push(`### ${cs.id} — ${cs.file}:${cs.line}`);
    lines.push("");

    if (codemod) {
      lines.push("**Before:**");
      lines.push("```js");
      lines.push(codemod.originalCode);
      lines.push("```");
      lines.push("");
      lines.push("**After:**");
      lines.push("```js");
      lines.push(codemod.newCode);
      lines.push("```");
      lines.push("");
      lines.push(`**Rationale:** ${codemod.rationale}`);
      lines.push("");
    }

    if (score) {
      lines.push("**Evidence:**");
      for (const e of score.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push("");

      if (score.overall < 0.5) {
        lines.push(
          `> ⚠️ **Manual review required** — confidence ${(score.overall * 100).toFixed(0)}% is below threshold`
        );
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
