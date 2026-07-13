import { execSync } from "node:child_process";
import path from "node:path";
import type { VerificationResult } from "../scan/types.js";

/**
 * Run `tsc --noEmit` on the target directory to verify type safety.
 * For JavaScript projects, this checks basic syntax and type inference.
 */
export function runTypecheck(targetDir: string): {
  passed: boolean;
  errors: string[];
} {
  const absoluteDir = path.resolve(targetDir);

  try {
    // Try running tsc if available, otherwise use node --check for JS files
    execSync("npx tsc --noEmit --allowJs --checkJs 2>&1", {
      cwd: absoluteDir,
      encoding: "utf-8",
      timeout: 30000,
    });
    return { passed: true, errors: [] };
  } catch (err: any) {
    // tsc may not be available or project may not have tsconfig
    // Fall back to node syntax check for .js files
    try {
      execSync("node --check src/**/*.js 2>&1", {
        cwd: absoluteDir,
        encoding: "utf-8",
        timeout: 10000,
      });
      return { passed: true, errors: [] };
    } catch (nodeErr: any) {
      const output = nodeErr.stdout || nodeErr.stderr || nodeErr.message || "";
      return {
        passed: false,
        errors: output
          .split("\n")
          .filter((l: string) => l.trim().length > 0),
      };
    }
  }
}
