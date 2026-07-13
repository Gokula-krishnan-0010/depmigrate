import { describe, it, expect } from "vitest";
import { generateReport } from "../../src/report/reportGenerator.js";
import type { ReportData } from "../../src/report/reportGenerator.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("Report Generator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "depmigrate-report-test-")
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleData: ReportData = {
    scanTarget: "/tmp/demo-repo",
    timestamp: "2025-01-01T00:00:00.000Z",
    callSites: [
      {
        id: "cs_001",
        file: "src/parser.js",
        line: 13,
        symbol: "Buffer",
        argType: "number_literal",
      },
    ],
    codemods: [
      {
        callSiteId: "cs_001",
        originalCode: "new Buffer(16)",
        newCode: "Buffer.alloc(16)",
        usedLlm: false,
        rationale: "Deterministic rule from Node DEP0005",
        selfConfidence: 1.0,
      },
    ],
    verifications: [
      {
        callSiteId: "cs_001",
        typecheckPassed: true,
        testsPassed: true,
        hasCoverage: true,
        errors: [],
      },
    ],
    scores: [
      {
        callSiteId: "cs_001",
        matchScore: 1.0,
        verificationScore: 1.0,
        historyScore: 0.95,
        overall: 0.99,
        evidence: [
          "[✓] Deterministic rule match",
          "[✓] Type-safe",
          "[✓] Tests pass",
        ],
      },
    ],
  };

  it("generates both markdown and JSON reports", () => {
    const { markdownPath, jsonPath } = generateReport(sampleData, tempDir);
    expect(fs.existsSync(markdownPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);
  });

  it("markdown report contains the expected structure", () => {
    const { markdownPath } = generateReport(sampleData, tempDir);
    const md = fs.readFileSync(markdownPath, "utf-8");
    expect(md).toContain("DepMigrate");
    expect(md).toContain("cs_001");
    expect(md).toContain("Buffer.alloc(16)");
    expect(md).toContain("Overall Confidence");
  });

  it("JSON report is valid and contains all data", () => {
    const { jsonPath } = generateReport(sampleData, tempDir);
    const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(json.callSites).toHaveLength(1);
    expect(json.codemods).toHaveLength(1);
    expect(json.scores).toHaveLength(1);
  });
});
