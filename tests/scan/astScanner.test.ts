import { describe, it, expect } from "vitest";
import { scanDirectory } from "../../src/scan/astScanner.js";
import path from "node:path";

const FIXTURE_DIR = path.resolve(__dirname, "..", "..", "fixtures", "demo-repo");
const PARSER_FILE = path.resolve(FIXTURE_DIR, "src", "parser.js");
const EXPO_FILE = path.resolve(FIXTURE_DIR, "src", "test-gk.js");

describe("AST Scanner — Buffer deprecations (parser.js)", () => {
  it("finds all 4 deprecated Buffer() call sites in parser.js", () => {
    const callSites = scanDirectory(PARSER_FILE);
    expect(callSites).toHaveLength(4);
  });

  it("assigns unique IDs to each call site", () => {
    const callSites = scanDirectory(PARSER_FILE);
    const ids = callSites.map((cs) => cs.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("correctly classifies a numeric literal arg", () => {
    const callSites = scanDirectory(PARSER_FILE);
    const numeric = callSites.find((cs) => cs.argType === "number_literal");
    expect(numeric).toBeDefined();
    expect(numeric!.symbol).toBe("Buffer");
  });

  it("correctly classifies a string literal arg", () => {
    const callSites = scanDirectory(PARSER_FILE);
    const str = callSites.find((cs) => cs.argType === "string_literal");
    expect(str).toBeDefined();
    expect(str!.symbol).toBe("Buffer");
  });

  it("correctly classifies a locally-inferred array arg", () => {
    const callSites = scanDirectory(PARSER_FILE);
    const arr = callSites.find((cs) => cs.argType === "array_local_inferred");
    expect(arr).toBeDefined();
    expect(arr!.symbol).toBe("Buffer");
  });

  it("correctly classifies an unresolvable arg", () => {
    const callSites = scanDirectory(PARSER_FILE);
    const unresolvable = callSites.find((cs) => cs.argType === "unresolvable");
    expect(unresolvable).toBeDefined();
    expect(unresolvable!.symbol).toBe("Buffer");
  });

  it("records correct file paths relative to the scan directory", () => {
    const callSites = scanDirectory(PARSER_FILE);
    for (const cs of callSites) {
      expect(cs.file).toContain("parser.js");
    }
  });

  it("records correct line numbers", () => {
    const callSites = scanDirectory(PARSER_FILE);
    for (const cs of callSites) {
      expect(cs.line).toBeGreaterThan(0);
    }
  });
});

describe("AST Scanner — Expo deprecations (test-gk.js)", () => {
  it("detects deprecated expo-av package import", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const expoAv = callSites.find(
      (cs) => cs.symbol === "expo-av" && cs.argType === "package_import"
    );
    expect(expoAv).toBeDefined();
    expect(expoAv!.snippet).toContain("expo-av");
  });

  it("detects deprecated Video component import from expo-av", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const videoImport = callSites.find(
      (cs) => cs.symbol === "expo-av.Video" && cs.argType === "component"
    );
    expect(videoImport).toBeDefined();
  });

  it("detects deprecated expo-background-fetch import", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const bgFetch = callSites.find(
      (cs) => cs.symbol === "expo-background-fetch"
    );
    expect(bgFetch).toBeDefined();
  });

  it("detects deprecated expo-face-detector import", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const faceDetector = callSites.find(
      (cs) => cs.symbol === "expo-face-detector"
    );
    expect(faceDetector).toBeDefined();
  });

  it("detects deprecated Constants.installationId property access", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const installId = callSites.find(
      (cs) => cs.symbol === "Constants.installationId"
    );
    expect(installId).toBeDefined();
    expect(installId!.argType).toBe("property");
  });

  it("detects deprecated Constants.isDevice property access", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const isDevice = callSites.find(
      (cs) => cs.symbol === "Constants.isDevice"
    );
    expect(isDevice).toBeDefined();
  });

  it("detects deprecated Constants.nativeAppVersion property access", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const appVersion = callSites.find(
      (cs) => cs.symbol === "Constants.nativeAppVersion"
    );
    expect(appVersion).toBeDefined();
  });

  it("detects deprecated Constants.platform.platform property access", () => {
    const callSites = scanDirectory(EXPO_FILE);
    const platform = callSites.find(
      (cs) => cs.symbol === "Constants.platform.platform"
    );
    expect(platform).toBeDefined();
  });

  it("finds at least 8 deprecated usages total", () => {
    const callSites = scanDirectory(EXPO_FILE);
    expect(callSites.length).toBeGreaterThanOrEqual(8);
  });

  it("includes snippet for each call site", () => {
    const callSites = scanDirectory(EXPO_FILE);
    for (const cs of callSites) {
      expect(cs.snippet).toBeDefined();
      expect(cs.snippet!.length).toBeGreaterThan(0);
    }
  });
});

describe("AST Scanner — Single file mode", () => {
  it("accepts a single file path instead of a directory", () => {
    const callSites = scanDirectory(PARSER_FILE);
    expect(callSites.length).toBe(4);
  });

  it("accepts a directory path and scans all files", () => {
    const callSites = scanDirectory(FIXTURE_DIR);
    // Should find both parser.js Buffer calls and test-gk.js Expo calls
    expect(callSites.length).toBeGreaterThan(4);
  });
});
