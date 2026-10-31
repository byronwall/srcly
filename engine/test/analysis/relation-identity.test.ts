import { expect, it } from "vitest";
import { stableId, stableRelationId } from "../../src/analysis/program-evidence-support";

it("preserves relation IDs with empty, repeated, and multi-file evidence", () => {
  const first = { file: "src/a.tsx", line: 2, column: 3, span: { startLine: 2, startColumn: 3, endLine: 4, endColumn: 5 } };
  const second = { file: "src/é|b.ts", line: 8, column: 9, span: { startLine: 10, startColumn: 11, endLine: 12, endColumn: 13 } };
  for (const locations of [[], [first], [first, first], [first, second]]) {
    const fields = ["source:1", "target:2", "references", locations, "ast-node", "Proof | with {separators} and é"] as const;
    expect(stableRelationId(...fields)).toBe(stableId("program-relation", [...fields]));
  }
});
