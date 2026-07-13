import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RulesCache } from "../../src/rules/rulesCache.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("RulesCache", () => {
  let cache: RulesCache;
  let dbPath: string;

  beforeEach(() => {
    // Use a temp file for each test to avoid conflicts
    dbPath = path.join(os.tmpdir(), `depmigrate-test-${Date.now()}.db`);
    cache = new RulesCache(dbPath);
  });

  afterEach(() => {
    cache.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it("seeds rules from seedRules.json on first initialization", () => {
    const all = cache.getAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("looks up a rule by symbol and argType", () => {
    const rule = cache.lookup("Buffer", "number_literal");
    expect(rule).not.toBeNull();
    expect(rule!.newExpression).toBe("Buffer.alloc({0})");
    expect(rule!.transformType).toBe("deterministic");
  });

  it("returns null for unknown symbol/argType combinations", () => {
    const rule = cache.lookup("Buffer", "unresolvable");
    expect(rule).toBeNull();
  });

  it("writes back a new rule", () => {
    cache.writeBack({
      symbol: "Buffer",
      argType: "unresolvable",
      newExpression: "Buffer.from({0})",
      transformType: "deterministic",
      source: "Confirmed LLM migration",
      confidenceHistory: 0.7,
    });

    const rule = cache.lookup("Buffer", "unresolvable");
    expect(rule).not.toBeNull();
    expect(rule!.newExpression).toBe("Buffer.from({0})");
  });

  it("updates confidence history with rolling average", () => {
    cache.updateConfidence("Buffer", "number_literal", 1.0);
    const rule = cache.lookup("Buffer", "number_literal");
    expect(rule).not.toBeNull();
    // Rolling average: 0.95 * 0.7 + 1.0 * 0.3 = 0.965
    expect(rule!.confidenceHistory).toBeCloseTo(0.965, 2);
  });
});
