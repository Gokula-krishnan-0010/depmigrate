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
  lines.push(`**Target:** \`${data.scanTarget}\``);
  lines.push(`**Generated:** ${data.timestamp}`);
  lines.push(`**Call sites found:** ${data.callSites.length}`);
  lines.push(`**Migrations applied:** ${data.codemods.filter(c => !isManualMigration(c)).length}`);
  lines.push(`**Manual reviews needed:** ${data.codemods.filter(c => isManualMigration(c)).length}`);
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
  lines.push("| ID | File | Line | Deprecated Symbol | Type | Method | Replacement |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const cs of data.callSites) {
    const codemod = data.codemods.find((c) => c.callSiteId === cs.id);
    const method = codemod
      ? isManualMigration(codemod)
        ? "📋 Manual"
        : codemod.usedLlm
          ? "⚡ LLM"
          : "✓ Deterministic"
      : "—";
    const replacement = codemod ? truncate(codemod.newCode, 50) : "—";
    lines.push(
      `| ${cs.id} | ${cs.file} | ${cs.line} | \`${cs.symbol}\` | ${cs.argType} | ${method} | ${replacement} |`
    );
  }
  lines.push("");

  // Separate manual migrations section
  const manualCodemods = data.codemods.filter(c => isManualMigration(c));
  if (manualCodemods.length > 0) {
    lines.push("## 📋 Manual Migrations Required");
    lines.push("");
    lines.push("The following deprecated APIs were detected and require manual code changes.");
    lines.push("Each item lists the deprecated usage and its recommended replacement.");
    lines.push("");

    // Group by source for cleaner output
    const bySource = new Map<string, { cs: CallSite; cm: CodemodResult; score?: ConfidenceScore }[]>();
    for (const cm of manualCodemods) {
      const cs = data.callSites.find(c => c.id === cm.callSiteId)!;
      const score = data.scores.find(s => s.callSiteId === cm.callSiteId);
      // Extract source from rationale
      const sourceMatch = cm.rationale.match(/\(([^)]+)\)/);
      const source = sourceMatch ? sourceMatch[1] : "Unknown";
      const existing = bySource.get(source) || [];
      existing.push({ cs, cm, score });
      bySource.set(source, existing);
    }

    for (const [source, items] of bySource) {
      lines.push(`### ${source}`);
      lines.push("");

      for (const { cs, cm, score } of items) {
        lines.push(`#### ${cs.id} — \`${cs.symbol}\``);
        lines.push("");
        lines.push(`- **File:** \`${cs.file}:${cs.line}\``);
        if (cs.snippet) {
          lines.push(`- **Current code:**`);
          lines.push("  ```js");
          lines.push(`  ${cs.snippet}`);
          lines.push("  ```");
        }
        lines.push(`- **Replace with:** ${cm.newCode}`);
        lines.push(`- **Rationale:** ${cm.rationale}`);
        lines.push("");
      }
    }
  }

  // Auto-applied changes section
  const autoCodemods = data.codemods.filter(c => !isManualMigration(c));
  if (autoCodemods.length > 0) {
    lines.push("## ✓ Auto-Applied Changes");
    lines.push("");

    for (const cm of autoCodemods) {
      const cs = data.callSites.find(c => c.id === cm.callSiteId)!;
      const score = data.scores.find((s) => s.callSiteId === cm.callSiteId);

      lines.push(`### ${cs.id} — ${cs.file}:${cs.line}`);
      lines.push("");
      lines.push("**Before:**");
      lines.push("```js");
      lines.push(cm.originalCode);
      lines.push("```");
      lines.push("");
      lines.push("**After:**");
      lines.push("```js");
      lines.push(cm.newCode);
      lines.push("```");
      lines.push("");
      lines.push(`**Rationale:** ${cm.rationale}`);
      lines.push("");

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
  }

  return lines.join("\n");
}

/**
 * Check if a codemod result represents a manual migration (not auto-applied).
 */
function isManualMigration(codemod: CodemodResult): boolean {
  return codemod.rationale.includes("Manual migration required");
}

/**
 * Truncate a string to a given max length.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + "...";
}
