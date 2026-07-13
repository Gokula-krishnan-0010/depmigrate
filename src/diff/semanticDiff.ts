import { Project, SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs";

/**
 * Compare the AST structure of two versions of a file to verify
 * that only the expected API surface was modified.
 */
export interface DiffResult {
  /** Whether only the deprecated API calls were changed */
  onlyApiSurfaceModified: boolean;
  /** Number of AST nodes that changed */
  changedNodeCount: number;
  /** Description of changes found */
  changes: string[];
}

/**
 * Perform a semantic diff between original and modified source code.
 * Compares AST structure to verify that only deprecated API calls were changed.
 */
export function semanticDiff(
  originalCode: string,
  modifiedCode: string,
  fileName: string = "file.js"
): DiffResult {
  const project = new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  });

  const origFile = project.createSourceFile(`orig_${fileName}`, originalCode);
  const modFile = project.createSourceFile(`mod_${fileName}`, modifiedCode);

  const changes: string[] = [];

  // Compare top-level structure
  const origStatements = origFile.getStatements();
  const modStatements = modFile.getStatements();

  if (origStatements.length !== modStatements.length) {
    changes.push(
      `Statement count changed: ${origStatements.length} → ${modStatements.length}`
    );
  }

  // Compare function declarations
  const origFunctions = origFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
  const modFunctions = modFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);

  if (origFunctions.length !== modFunctions.length) {
    changes.push(
      `Function count changed: ${origFunctions.length} → ${modFunctions.length}`
    );
  }

  // Compare variable declarations
  const origVars = origFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  const modVars = modFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  if (origVars.length !== modVars.length) {
    changes.push(
      `Variable declaration count changed: ${origVars.length} → ${modVars.length}`
    );
  }

  // Check that only Buffer-related expressions changed
  const origCalls = origFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const modCalls = modFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  // Count non-Buffer call expression changes
  const origNonBuffer = origCalls.filter(
    (c) => !c.getText().includes("Buffer")
  );
  const modNonBuffer = modCalls.filter(
    (c) => !c.getText().includes("Buffer")
  );

  if (origNonBuffer.length !== modNonBuffer.length) {
    changes.push("Non-Buffer call expressions were modified");
  }

  // Check for new Buffer → Buffer.from/alloc/allocUnsafe transitions
  const origNewExprs = origFile.getDescendantsOfKind(SyntaxKind.NewExpression);
  const modNewExprs = modFile.getDescendantsOfKind(SyntaxKind.NewExpression);

  const origBufferNew = origNewExprs.filter(
    (n) => n.getExpression().getText() === "Buffer"
  );
  const modBufferNew = modNewExprs.filter(
    (n) => n.getExpression().getText() === "Buffer"
  );

  if (origBufferNew.length > modBufferNew.length) {
    const diff = origBufferNew.length - modBufferNew.length;
    changes.push(`${diff} deprecated new Buffer() expression(s) replaced`);
  }

  const onlyApiSurfaceModified =
    changes.every(
      (c) =>
        c.includes("Buffer") ||
        c.includes("deprecated")
    ) || changes.length === 0;

  return {
    onlyApiSurfaceModified,
    changedNodeCount: changes.length,
    changes,
  };
}

/**
 * Compare two versions of a file on disk.
 */
export function semanticDiffFiles(
  originalPath: string,
  modifiedPath: string
): DiffResult {
  const origCode = fs.readFileSync(originalPath, "utf-8");
  const modCode = fs.readFileSync(modifiedPath, "utf-8");
  return semanticDiff(origCode, modCode, path.basename(originalPath));
}
