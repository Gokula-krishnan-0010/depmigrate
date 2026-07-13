import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/**
 * Run the test suite for the target project.
 * Supports vitest, jest, mocha, and npm test.
 */
export function runTests(targetDir: string): {
  passed: boolean;
  errors: string[];
  hasCoverage: boolean;
} {
  const absoluteDir = path.resolve(targetDir);
  const pkgPath = path.join(absoluteDir, "package.json");

  // Check if the project has a test script
  let testCommand = "npm test";
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.scripts?.test) {
      testCommand = "npm test";
    } else {
      // No test script defined
      return {
        passed: true,
        errors: ["No test script defined in package.json"],
        hasCoverage: false,
      };
    }
  } else {
    return {
      passed: true,
      errors: ["No package.json found"],
      hasCoverage: false,
    };
  }

  try {
    const output = execSync(`${testCommand} 2>&1`, {
      cwd: absoluteDir,
      encoding: "utf-8",
      timeout: 60000,
      env: { ...process.env, CI: "true", NODE_ENV: "test" },
    });

    // Check if any tests actually ran (coverage signal)
    const hasCoverage =
      output.includes("passing") ||
      output.includes("Tests:") ||
      output.includes("test passed") ||
      output.includes("✓") ||
      output.includes("PASS");

    return { passed: true, errors: [], hasCoverage };
  } catch (err: any) {
    const output = err.stdout || err.stderr || err.message || "";
    return {
      passed: false,
      errors: output
        .split("\n")
        .filter((l: string) => l.trim().length > 0)
        .slice(0, 20), // Cap error output
      hasCoverage: false,
    };
  }
}
