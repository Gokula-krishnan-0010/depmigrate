import type { CallSite } from "../scan/types.js";

/**
 * Determine the execution order for applying codemods to call sites.
 *
 * For the MVP, this is a same-file, top-to-bottom order (by file, then by line number
 * descending — we apply bottom-up within a file to preserve line numbers).
 *
 * The interface is general enough to support topological ordering in the future
 * (e.g., import renames before dependent call rewrites).
 */
export function planExecutionOrder(callSites: CallSite[]): CallSite[] {
  // Group by file, then sort within each file by line descending
  // (bottom-up application preserves line numbers for earlier edits)
  const grouped = new Map<string, CallSite[]>();

  for (const cs of callSites) {
    const existing = grouped.get(cs.file) || [];
    existing.push(cs);
    grouped.set(cs.file, existing);
  }

  const ordered: CallSite[] = [];

  // Sort files alphabetically for deterministic output
  const sortedFiles = [...grouped.keys()].sort();

  for (const file of sortedFiles) {
    const sites = grouped.get(file)!;
    // Sort by line descending — apply from bottom to top to avoid line offset issues
    sites.sort((a, b) => b.line - a.line);
    ordered.push(...sites);
  }

  return ordered;
}
