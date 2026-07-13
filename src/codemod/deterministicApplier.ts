import {
  Project,
  SyntaxKind,
  NewExpression,
  CallExpression,
} from "ts-morph";
import path from "node:path";
import fs from "node:fs";
import type { CallSite, RuleCacheEntry, CodemodResult } from "../scan/types.js";

/**
 * Apply a deterministic codemod to a call site using a cached rule.
 * Zero LLM tokens consumed.
 */
export function applyDeterministicCodemod(
  callSite: CallSite,
  rule: RuleCacheEntry,
  targetDir: string
): CodemodResult {
  const absoluteFile = path.resolve(targetDir, callSite.file);
  const originalContent = fs.readFileSync(absoluteFile, "utf-8");

  const project = new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  });

  const sourceFile = project.createSourceFile("temp.js", originalContent);

  let originalCode = "";
  let newCode = "";
  let found = false;

  // Look for `new Buffer(...)` expressions
  for (const newExpr of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (
      newExpr.getStartLineNumber() === callSite.line &&
      newExpr.getExpression().getText() === callSite.symbol
    ) {
      originalCode = newExpr.getText();
      const args = newExpr.getArguments().map((a) => a.getText());
      newCode = buildReplacement(rule.newExpression, args);
      newExpr.replaceWithText(newCode);
      found = true;
      break;
    }
  }

  // If not found as new expression, look for direct function calls
  if (!found) {
    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (
        callExpr.getStartLineNumber() === callSite.line &&
        callExpr.getExpression().getText() === callSite.symbol &&
        callExpr.getExpression().getKind() === SyntaxKind.Identifier
      ) {
        originalCode = callExpr.getText();
        const args = callExpr.getArguments().map((a) => a.getText());
        newCode = buildReplacement(rule.newExpression, args);
        callExpr.replaceWithText(newCode);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new Error(
      `Could not find deprecated ${callSite.symbol} call at ${callSite.file}:${callSite.line}`
    );
  }

  fs.writeFileSync(absoluteFile, sourceFile.getFullText(), "utf-8");

  return {
    callSiteId: callSite.id,
    originalCode,
    newCode,
    usedLlm: false,
    rationale: `Deterministic rule from ${rule.source}: ${rule.newExpression}`,
    selfConfidence: 1.0,
  };
}

function buildReplacement(template: string, args: string[]): string {
  let result = template;
  for (let i = 0; i < args.length; i++) {
    result = result.replace(`{${i}}`, args[i]);
  }
  return result;
}
