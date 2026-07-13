import { describe, it, expect } from "vitest";
import { planExecutionOrder } from "../../src/plan/executionOrder.js";
import type { CallSite } from "../../src/scan/types.js";

describe("Execution Order", () => {
  it("orders call sites bottom-up within the same file", () => {
    const callSites: CallSite[] = [
      { id: "cs_001", file: "a.js", line: 5, symbol: "Buffer", argType: "number_literal" },
      { id: "cs_002", file: "a.js", line: 15, symbol: "Buffer", argType: "string_literal" },
      { id: "cs_003", file: "a.js", line: 10, symbol: "Buffer", argType: "array_local_inferred" },
    ];

    const ordered = planExecutionOrder(callSites);
    expect(ordered[0].line).toBe(15); // Bottom first
    expect(ordered[1].line).toBe(10);
    expect(ordered[2].line).toBe(5);  // Top last
  });

  it("groups by file then sorts within each file", () => {
    const callSites: CallSite[] = [
      { id: "cs_001", file: "b.js", line: 5, symbol: "Buffer", argType: "number_literal" },
      { id: "cs_002", file: "a.js", line: 10, symbol: "Buffer", argType: "string_literal" },
      { id: "cs_003", file: "a.js", line: 5, symbol: "Buffer", argType: "array_local_inferred" },
    ];

    const ordered = planExecutionOrder(callSites);
    expect(ordered[0].file).toBe("a.js");
    expect(ordered[1].file).toBe("a.js");
    expect(ordered[2].file).toBe("b.js");
  });

  it("handles empty input", () => {
    const ordered = planExecutionOrder([]);
    expect(ordered).toEqual([]);
  });
});
