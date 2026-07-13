import { Project, SyntaxKind, Node, SourceFile } from "ts-morph";
import path from "node:path";
import fs from "node:fs";
import type { CallSite } from "./types.js";
import type { RuleCacheEntry } from "./types.js";

/**
 * Deprecated symbols to scan for (Node.js built-ins).
 */
const DEPRECATED_SYMBOLS = new Set(["Buffer"]);

/**
 * Deprecated Expo/React Native package imports to detect.
 * Maps package specifier → rule symbol used in seedRules.json
 */
const DEPRECATED_IMPORTS: Record<string, { symbol: string; argType: string }> = {
  "expo-av":              { symbol: "expo-av",              argType: "package_import" },
  "expo-barcode-scanner": { symbol: "expo-barcode-scanner", argType: "package_import" },
  "expo-face-detector":   { symbol: "expo-face-detector",   argType: "package_import" },
  "expo-background-fetch":{ symbol: "expo-background-fetch",argType: "package_import" },
  "react-native-iap":     { symbol: "react-native-iap",     argType: "package_import" },
  "expo-sqlite/next":     { symbol: "expo-sqlite/next import", argType: "import_path" },
  "expo-sqlite/legacy":   { symbol: "expo-sqlite/legacy import", argType: "import_path" },
};

/**
 * Deprecated named imports from specific packages.
 * Maps "package:namedExport" → rule symbol
 */
const DEPRECATED_NAMED_IMPORTS: Record<string, { symbol: string; argType: string }> = {
  "expo-av:Video":  { symbol: "expo-av.Video", argType: "component" },
  "expo-av:Audio":  { symbol: "expo-av.Audio", argType: "api" },
};

/**
 * Deprecated property accesses on imported modules.
 * Maps "ImportedName.property" → rule symbol
 */
const DEPRECATED_PROPERTY_ACCESS: Record<string, { symbol: string; argType: string }> = {
  "Constants.installationId":    { symbol: "Constants.installationId",    argType: "property" },
  "Constants.isDevice":          { symbol: "Constants.isDevice",          argType: "property" },
  "Constants.nativeAppVersion":  { symbol: "Constants.nativeAppVersion",  argType: "property" },
  "Constants.nativeBuildVersion": { symbol: "Constants.nativeBuildVersion", argType: "property" },
  "Constants.deviceYearClass":   { symbol: "Constants.deviceYearClass",   argType: "property" },
  "Constants.platform.platform": { symbol: "Constants.platform.platform", argType: "property" },
  "Constants.platform.systemVersion": { symbol: "Constants.platform.systemVersion", argType: "property" },
  "Constants.platform.userInterfaceIdiom": { symbol: "Constants.platform.userInterfaceIdiom", argType: "property" },
  "Constants.IOSManifest.model": { symbol: "Constants.IOSManifest.model", argType: "property" },
  "Constants.IOSManifest.platform": { symbol: "Constants.IOSManifest.platform", argType: "property" },
  "Constants.IOSManifest.systemVersion": { symbol: "Constants.IOSManifest.systemVersion", argType: "property" },
  "Constants.IOSManifest.userInterfaceIdiom": { symbol: "Constants.IOSManifest.userInterfaceIdiom", argType: "property" },
  "Constants.AndroidManifest.versionCode": { symbol: "Constants.AndroidManifest.versionCode", argType: "property" },
};

/**
 * Classify the argument type for a deprecated Buffer call site.
 */
function classifyBufferArgType(
  args: Node[],
  sourceFile: SourceFile
): string {
  if (args.length === 0) return "unresolvable";

  const firstArg = args[0];

  if (firstArg.getKind() === SyntaxKind.NumericLiteral) {
    return "number_literal";
  }

  if (firstArg.getKind() === SyntaxKind.StringLiteral) {
    return "string_literal";
  }

  if (
    firstArg.getKind() === SyntaxKind.TemplateExpression ||
    firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
  ) {
    return "string_literal";
  }

  if (firstArg.getKind() === SyntaxKind.ArrayLiteralExpression) {
    return "array_local_inferred";
  }

  if (firstArg.getKind() === SyntaxKind.Identifier) {
    const identName = firstArg.getText();
    const declarations = sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration
    );
    for (const decl of declarations) {
      if (decl.getName() === identName) {
        const init = decl.getInitializer();
        if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
          return "array_local_inferred";
        }
      }
    }
  }

  return "unresolvable";
}

/**
 * Resolve a target path into a scan root directory and file patterns.
 * Supports both directories and single files.
 */
function resolveTarget(targetPath: string): { scanRoot: string; isFile: boolean } {
  const resolved = path.resolve(targetPath);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return { scanRoot: path.dirname(resolved), isFile: true };
  }
  return { scanRoot: resolved, isFile: false };
}

/**
 * Scan a directory or single file for deprecated API usage using AST analysis.
 * Detects:
 *  - Node.js Buffer() deprecations
 *  - Deprecated Expo/React Native package imports
 *  - Deprecated property accesses (Constants.installationId, etc.)
 *  - Deprecated named imports (Video from expo-av, etc.)
 *
 * @param targetPath - Absolute or relative path to a directory or single file
 * @returns Array of CallSite objects describing each deprecated usage
 */
export function scanDirectory(targetPath: string): CallSite[] {
  const resolved = path.resolve(targetPath);
  const stat = fs.statSync(resolved);
  const isFile = stat.isFile();
  const scanRoot = isFile ? path.dirname(resolved) : resolved;
  const callSites: CallSite[] = [];
  let counter = 0;

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      jsx: 2, // React
    },
    skipAddingFilesFromTsConfig: true,
  });

  if (isFile) {
    project.addSourceFileAtPath(resolved);
  } else {
    project.addSourceFilesAtPaths([
      path.join(scanRoot, "**/*.js"),
      path.join(scanRoot, "**/*.ts"),
      path.join(scanRoot, "**/*.jsx"),
      path.join(scanRoot, "**/*.tsx"),
    ]);
  }

  // Track what identifiers map to which deprecated packages
  // e.g., import Constants from 'expo-constants' → Constants is from expo-constants
  const importMap = new Map<string, { packageName: string; sourceFile: SourceFile }>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(scanRoot, sourceFile.getFilePath());

    // Skip node_modules
    if (filePath.includes("node_modules")) continue;

    const fileContent = sourceFile.getFullText();
    const lines = fileContent.split("\n");

    // ═══════════════════════════════════════════════════
    // DETECTION 1: Deprecated package imports
    // ═══════════════════════════════════════════════════
    const importDecls = sourceFile.getImportDeclarations();
    for (const importDecl of importDecls) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Check for deprecated package imports
      if (DEPRECATED_IMPORTS[moduleSpecifier]) {
        const { symbol, argType } = DEPRECATED_IMPORTS[moduleSpecifier];
        counter++;
        callSites.push({
          id: `cs_${String(counter).padStart(3, "0")}`,
          file: filePath,
          line: importDecl.getStartLineNumber(),
          symbol,
          argType,
          snippet: importDecl.getText().trim(),
        });
      }

      // Check for deprecated named imports from a package
      const namedImports = importDecl.getNamedImports();
      for (const named of namedImports) {
        const key = `${moduleSpecifier}:${named.getName()}`;
        if (DEPRECATED_NAMED_IMPORTS[key]) {
          const { symbol, argType } = DEPRECATED_NAMED_IMPORTS[key];
          counter++;
          callSites.push({
            id: `cs_${String(counter).padStart(3, "0")}`,
            file: filePath,
            line: importDecl.getStartLineNumber(),
            symbol,
            argType,
            snippet: importDecl.getText().trim(),
          });
        }
      }

      // Track default and namespace imports for property access detection
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        importMap.set(defaultImport.getText(), {
          packageName: moduleSpecifier,
          sourceFile,
        });
      }
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        importMap.set(namespaceImport.getText(), {
          packageName: moduleSpecifier,
          sourceFile,
        });
      }
    }

    // ═══════════════════════════════════════════════════
    // DETECTION 2: Deprecated property accesses
    // ═══════════════════════════════════════════════════
    const propAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    for (const prop of propAccesses) {
      const fullText = prop.getText();

      // Check against our known deprecated property patterns
      // We need to check longest matches first to avoid partial matches
      const matchingKeys = Object.keys(DEPRECATED_PROPERTY_ACCESS)
        .filter((key) => fullText.startsWith(key) || fullText === key)
        .sort((a, b) => b.length - a.length);

      if (matchingKeys.length > 0) {
        const bestMatch = matchingKeys[0];
        // Only match if fullText IS the key or starts with key followed by non-alphanumeric
        if (fullText === bestMatch || !fullText[bestMatch.length]?.match(/[a-zA-Z0-9_]/)) {
          const { symbol, argType } = DEPRECATED_PROPERTY_ACCESS[bestMatch];

          // Avoid duplicate detection: skip if this is a child of an already-detected longer expression
          const parentProp = prop.getParent();
          const isChildOfLongerMatch = parentProp &&
            parentProp.getKind() === SyntaxKind.PropertyAccessExpression &&
            Object.keys(DEPRECATED_PROPERTY_ACCESS).some(
              (k) => parentProp.getText() === k || parentProp.getText().startsWith(k)
            );

          if (!isChildOfLongerMatch) {
            counter++;
            const lineNum = prop.getStartLineNumber();
            callSites.push({
              id: `cs_${String(counter).padStart(3, "0")}`,
              file: filePath,
              line: lineNum,
              symbol,
              argType,
              snippet: lines[lineNum - 1]?.trim() || fullText,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // DETECTION 3: Deprecated Buffer() calls (original)
    // ═══════════════════════════════════════════════════
    sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression).forEach(
      (newExpr) => {
        const exprText = newExpr.getExpression().getText();
        if (DEPRECATED_SYMBOLS.has(exprText)) {
          counter++;
          const args = newExpr.getArguments();
          const lineNum = newExpr.getStartLineNumber();
          callSites.push({
            id: `cs_${String(counter).padStart(3, "0")}`,
            file: filePath,
            line: lineNum,
            symbol: exprText,
            argType: classifyBufferArgType(args, sourceFile),
            snippet: lines[lineNum - 1]?.trim() || newExpr.getText(),
          });
        }
      }
    );

    // Buffer() function calls (without new)
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(
      (callExpr) => {
        const exprText = callExpr.getExpression().getText();
        if (DEPRECATED_SYMBOLS.has(exprText)) {
          if (callExpr.getExpression().getKind() === SyntaxKind.Identifier) {
            counter++;
            const args = callExpr.getArguments();
            const lineNum = callExpr.getStartLineNumber();
            callSites.push({
              id: `cs_${String(counter).padStart(3, "0")}`,
              file: filePath,
              line: lineNum,
              symbol: exprText,
              argType: classifyBufferArgType(args, sourceFile),
              snippet: lines[lineNum - 1]?.trim() || callExpr.getText(),
            });
          }
        }
      }
    );

    // ═══════════════════════════════════════════════════
    // DETECTION 4: JSX usage of deprecated components
    // ═══════════════════════════════════════════════════
    // Detect <Video .../> from expo-av (JSX opening elements)
    try {
      const jsxElements = [
        ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ];
      for (const jsx of jsxElements) {
        const tagName = jsx.getTagNameNode().getText();
        // Check if this component name was imported from a deprecated package
        for (const [importName, info] of importMap) {
          // Check for namespace usage: <SomePackage.Component>
          if (tagName === importName || tagName.startsWith(`${importName}.`)) {
            const depKey = `${info.packageName}:${tagName}`;
            // We already detected the import itself — skip JSX duplication
            // unless the component has its own specific rule
          }
        }
      }
    } catch {
      // JSX parsing may fail for non-JSX files, silently ignore
    }
  }

  // Deduplicate: remove call sites with same symbol+line in same file
  const seen = new Set<string>();
  const deduped: CallSite[] = [];
  for (const cs of callSites) {
    const key = `${cs.file}:${cs.line}:${cs.symbol}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(cs);
    }
  }

  return deduped;
}
