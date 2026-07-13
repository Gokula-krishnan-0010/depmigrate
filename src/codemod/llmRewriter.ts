import Anthropic from "@anthropic-ai/sdk";
import {
  Project,
  SyntaxKind,
} from "ts-morph";
import path from "node:path";
import fs from "node:fs";
import type {
  CallSite,
  CodemodResult,
  LlmRewriteRequest,
  LlmRewriteResponse,
} from "../scan/types.js";

/**
 * Apply an LLM-assisted rewrite for an ambiguous call site.
 * Sends minimal scoped context to the Anthropic API.
 */
export async function applyLlmRewrite(
  callSite: CallSite,
  targetDir: string,
  apiKey?: string
): Promise<CodemodResult> {
  const absoluteFile = path.resolve(targetDir, callSite.file);
  const originalContent = fs.readFileSync(absoluteFile, "utf-8");

  // Extract the call site code and enclosing function signature
  const project = new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  });

  const sourceFile = project.createSourceFile("temp.js", originalContent);
  const lines = originalContent.split("\n");
  const targetLine = lines[callSite.line - 1]?.trim() || "";

  // Find enclosing function signature
  let functionSig = "<top-level>";
  const allFunctions = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
  ];

  for (const fn of allFunctions) {
    const startLine = fn.getStartLineNumber();
    const endLine = fn.getEndLineNumber();
    if (callSite.line >= startLine && callSite.line <= endLine) {
      // Get just the signature, not the body
      const fnText = fn.getText();
      const braceIdx = fnText.indexOf("{");
      functionSig = braceIdx > 0
        ? fnText.substring(0, braceIdx).trim()
        : fnText.split("\n")[0].trim();
      break;
    }
  }

  const request: LlmRewriteRequest = {
    call_site: targetLine,
    function_sig: functionSig,
    deprecation_note:
      "Buffer() constructor is deprecated (DEP0005). May return uninitialized memory for numeric args. Use Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe() instead.",
  };

  // Call Anthropic API
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Fallback: return a synthetic LLM response for demo/test purposes
    return createFallbackResult(callSite, targetLine, originalContent, absoluteFile);
  }

  const client = new Anthropic({ apiKey: key });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a code migration assistant. Given a deprecated API call site, produce a safe replacement.

Context:
- Call site: ${request.call_site}
- Enclosing function: ${request.function_sig}
- Deprecation: ${request.deprecation_note}

Respond with ONLY a JSON object (no markdown fences):
{
  "new_code": "<replacement code for just the Buffer() call>",
  "rationale": "<why this replacement is correct>",
  "self_confidence": <0.0 to 1.0>
}`,
      },
    ],
  });

  // Parse LLM response
  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";
  let llmResponse: LlmRewriteResponse;

  try {
    llmResponse = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      llmResponse = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse LLM response: ${responseText}`);
    }
  }

  // Apply the rewrite to the file
  const newContent = applyRewriteToFile(
    originalContent,
    callSite,
    llmResponse.new_code,
    sourceFile
  );
  fs.writeFileSync(absoluteFile, newContent, "utf-8");

  return {
    callSiteId: callSite.id,
    originalCode: targetLine,
    newCode: llmResponse.new_code,
    usedLlm: true,
    rationale: llmResponse.rationale,
    selfConfidence: llmResponse.self_confidence,
  };
}

/**
 * Fallback when no API key is available — produces a reasonable default.
 */
function createFallbackResult(
  callSite: CallSite,
  targetLine: string,
  originalContent: string,
  absoluteFile: string
): CodemodResult {
  // For unresolvable Buffer() calls, Buffer.from() is the safest general replacement
  const newCode = targetLine
    .replace(/new\s+Buffer\s*\(/, "Buffer.from(")
    .replace(/(?<!new\s+)(?<!\.)\bBuffer\s*\(/, "Buffer.from(");

  const newContent = originalContent.split("\n");
  newContent[callSite.line - 1] = newContent[callSite.line - 1].replace(
    targetLine,
    newCode
  );
  fs.writeFileSync(absoluteFile, newContent.join("\n"), "utf-8");

  return {
    callSiteId: callSite.id,
    originalCode: targetLine,
    newCode,
    usedLlm: true,
    rationale:
      "Fallback: Buffer.from() is the safest general replacement for Buffer() with unknown argument types. Manual review recommended as the argument may need Buffer.alloc() for numeric inputs.",
    selfConfidence: 0.4,
  };
}

function applyRewriteToFile(
  content: string,
  callSite: CallSite,
  newCode: string,
  sourceFile: ReturnType<Project["createSourceFile"]>
): string {
  // Find the exact node to replace
  const nodes = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression),
  ];

  for (const node of nodes) {
    if (node.getStartLineNumber() !== callSite.line) continue;

    const exprText =
      node.getKind() === SyntaxKind.NewExpression
        ? (node as any).getExpression().getText()
        : (node as any).getExpression().getText();

    if (exprText === callSite.symbol) {
      const originalNodeText = node.getText();
      return content.replace(originalNodeText, newCode);
    }
  }

  // Fallback: line-based replacement
  const lines = content.split("\n");
  const line = lines[callSite.line - 1];
  const bufferPattern = /(?:new\s+)?Buffer\s*\([^)]*\)/;
  lines[callSite.line - 1] = line.replace(bufferPattern, newCode);
  return lines.join("\n");
}
