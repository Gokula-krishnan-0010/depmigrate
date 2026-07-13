import { describe, it, expect } from "vitest";
import { scanDirectory } from "../../src/scan/astScanner.js";
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "..", "..", "fixtures", "demo-repo");

describe("AST Scanner", () => {
  it("finds all 4 deprecated Buffer() call sites in the fixture", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    expect(callSites).toHaveLength(4);
  });

  it("assigns unique IDs to each call site", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    const ids = callSites.map((cs) => cs.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("correctly classifies a numeric literal arg", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    const numeric = callSites.find((cs) => cs.argType === "number_literal");
    expect(numeric).toBeDefined();
    expect(numeric!.symbol).toBe("Buffer");
  });

  it("correctly classifies a string literal arg", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    const str = callSites.find((cs) => cs.argType === "string_literal");
    expect(str).toBeDefined();
    expect(str!.symbol).toBe("Buffer");
  });

  it("correctly classifies a locally-inferred array arg", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    const arr = callSites.find((cs) => cs.argType === "array_local_inferred");
    expect(arr).toBeDefined();
    expect(arr!.symbol).toBe("Buffer");
  });

  it("correctly classifies an unresolvable arg", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    const unresolvable = callSites.find((cs) => cs.argType === "unresolvable");
    expect(unresolvable).toBeDefined();
    expect(unresolvable!.symbol).toBe("Buffer");
  });

  it("records correct file paths relative to the scan directory", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    for (const cs of callSites) {
      expect(cs.file).toContain("parser.js");
    }
  });

  it("records correct line numbers", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    for (const cs of callSites) {
      expect(cs.line).toBeGreaterThan(0);
    }
  });
});
