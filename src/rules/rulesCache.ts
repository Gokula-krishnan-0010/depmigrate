import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import type { RuleCacheEntry } from "../scan/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_RULES_PATH = path.join(__dirname, "seedRules.json");

/**
 * SQLite-backed rules cache for migration patterns.
 * Supports lookup by (symbol, argType) and write-back of confirmed LLM-derived rules.
 */
export class RulesCache {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(__dirname, "..", "..", "depmigrate-rules.db");
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  /**
   * Initialize the database schema and seed with known rules if empty.
   */
  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        symbol TEXT NOT NULL,
        argType TEXT NOT NULL,
        newExpression TEXT NOT NULL,
        transformType TEXT NOT NULL CHECK(transformType IN ('deterministic', 'requires_llm', 'manual')),
        source TEXT NOT NULL,
        confidenceHistory REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (symbol, argType)
      )
    `);

    // Seed rules if the table is empty
    const count = this.db
      .prepare("SELECT COUNT(*) as cnt FROM rules")
      .get() as { cnt: number };

    if (count.cnt === 0) {
      this.seedFromFile();
    }
  }

  /**
   * Load seed rules from the JSON file into the database.
   */
  private seedFromFile(): void {
    let seedPath = SEED_RULES_PATH;
    if (!fs.existsSync(seedPath)) {
      // If run from dist/rules, check src/rules
      seedPath = path.join(__dirname, "..", "..", "src", "rules", "seedRules.json");
    }
    if (!fs.existsSync(seedPath)) {
      seedPath = path.join(__dirname, "seedRules.json");
    }
    if (!fs.existsSync(seedPath)) {
      console.warn("Warning: seedRules.json not found, starting with empty cache");
      return;
    }

    const seedData: RuleCacheEntry[] = JSON.parse(
      fs.readFileSync(seedPath, "utf-8")
    );

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO rules (symbol, argType, newExpression, transformType, source, confidenceHistory)
      VALUES (@symbol, @argType, @newExpression, @transformType, @source, @confidenceHistory)
    `);

    const insertMany = this.db.transaction((rules: RuleCacheEntry[]) => {
      for (const rule of rules) {
        insert.run(rule);
      }
    });

    insertMany(seedData);
  }

  /**
   * Look up a migration rule by symbol and argument type.
   * @returns The matching rule or null if no rule exists.
   */
  lookup(symbol: string, argType: string): RuleCacheEntry | null {
    const row = this.db
      .prepare("SELECT * FROM rules WHERE symbol = ? AND argType = ?")
      .get(symbol, argType) as RuleCacheEntry | undefined;

    return row || null;
  }

  /**
   * Write a new rule or update an existing one.
   * Used to persist confirmed LLM-derived migrations (feedback loop).
   */
  writeBack(entry: RuleCacheEntry): void {
    this.db
      .prepare(
        `
      INSERT INTO rules (symbol, argType, newExpression, transformType, source, confidenceHistory)
      VALUES (@symbol, @argType, @newExpression, @transformType, @source, @confidenceHistory)
      ON CONFLICT(symbol, argType) DO UPDATE SET
        newExpression = @newExpression,
        transformType = @transformType,
        source = @source,
        confidenceHistory = @confidenceHistory
    `
      )
      .run(entry);
  }

  /**
   * Update the rolling confidence history for a rule.
   */
  updateConfidence(symbol: string, argType: string, newConfidence: number): void {
    const existing = this.lookup(symbol, argType);
    if (!existing) return;

    // Rolling average: (old * 0.7) + (new * 0.3)
    const updated =
      existing.confidenceHistory === 0
        ? newConfidence
        : existing.confidenceHistory * 0.7 + newConfidence * 0.3;

    this.db
      .prepare(
        "UPDATE rules SET confidenceHistory = ? WHERE symbol = ? AND argType = ?"
      )
      .run(updated, symbol, argType);
  }

  /**
   * Get all rules in the cache.
   */
  getAll(): RuleCacheEntry[] {
    return this.db.prepare("SELECT * FROM rules").all() as RuleCacheEntry[];
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
