import { Project, SyntaxKind, Node, NewExpression, CallExpression, SourceFile } from "ts-morph";
import path from "node:path";
import type { CallSite } from "./types.js";

/**
 * Deprecated symbols to scan for.
 * For the MVP, we focus on Node.js Buffer() deprecation (DEP0005).
 */
const DEPRECATED_SYMBOLS = new Set(["Buffer"]);

/**
 * Classify the argument type for a deprecated call site.
 * Used to route to deterministic vs LLM-assisted rewrites.
 */
function classifyArgType(
  args: Node[],
  sourceFile: SourceFile
): CallSite["argType"] {
  if (args.length === 0) return "unresolvable";

  const firstArg = args[0];

  // Check for numeric literal: new Buffer(10)
  if (firstArg.getKind() === SyntaxKind.NumericLiteral) {
    return "number_literal";
  }

  // Check for string literal: new Buffer("hello")
  if (firstArg.getKind() === SyntaxKind.StringLiteral) {
    return "string_literal";
  }

  // Check for template literal: new Buffer(`hello ${name}`)
  if (
    firstArg.getKind() === SyntaxKind.TemplateExpression ||
    firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
  ) {
    return "string_literal";
  }

  // Check for array literal: new Buffer([1, 2, 3])
  if (firstArg.getKind() === SyntaxKind.ArrayLiteralExpression) {
    return "array_local_inferred";
  }

  // Check for identifier pointing to a local array
  if (firstArg.getKind() === SyntaxKind.Identifier) {
    const identName = firstArg.getText();
    // Walk up to find variable declarations in the same file
    const declarations = sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration
    );
    for (const decl of declarations) {
      if (decl.getName() === identName) {
        const init = decl.getInitializer();
        if (
          init &&
          init.getKind() === SyntaxKind.ArrayLiteralExpression
        ) {
          return "array_local_inferred";
        }
      }
    }
  }

  // Anything else is unresolvable
  return "unresolvable";
}

/**
 * Scan a directory for deprecated API call sites using AST analysis.
 *
 * @param targetDir - Absolute or relative path to the directory to scan
 * @returns Array of CallSite objects describing each deprecated usage
 */
export function scanDirectory(targetDir: string): CallSite[] {
  const absoluteDir = path.resolve(targetDir);
  const callSites: CallSite[] = [];
  let counter = 0;

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  // Add all JS/TS files in the target directory
  project.addSourceFilesAtPaths([
    path.join(absoluteDir, "**/*.js"),
    path.join(absoluteDir, "**/*.ts"),
    path.join(absoluteDir, "**/*.jsx"),
    path.join(absoluteDir, "**/*.tsx"),
  ]);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(absoluteDir, sourceFile.getFilePath());

    // Skip node_modules
    if (filePath.includes("node_modules")) continue;

    // Find `new Buffer(...)` expressions
    sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression).forEach(
      (newExpr: NewExpression) => {
        const exprText = newExpr.getExpression().getText();
        if (DEPRECATED_SYMBOLS.has(exprText)) {
          counter++;
          const args = newExpr.getArguments();
          callSites.push({
            id: `cs_${String(counter).padStart(3, "0")}`,
            file: filePath,
            line: newExpr.getStartLineNumber(),
            symbol: exprText,
            argType: classifyArgType(args, sourceFile),
          });
        }
      }
    );

    // Find `Buffer(...)` function calls (without new)
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(
      (callExpr: CallExpression) => {
        const exprText = callExpr.getExpression().getText();
        if (DEPRECATED_SYMBOLS.has(exprText)) {
          // Make sure this isn't a property access like Buffer.from(...)
          if (
            callExpr.getExpression().getKind() === SyntaxKind.Identifier
          ) {
            counter++;
            const args = callExpr.getArguments();
            callSites.push({
              id: `cs_${String(counter).padStart(3, "0")}`,
              file: filePath,
              line: callExpr.getStartLineNumber(),
              symbol: exprText,
              argType: classifyArgType(args, sourceFile),
            });
          }
        }
      }
    );
  }

  return callSites;
}
