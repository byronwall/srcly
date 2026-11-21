import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./parseUnifiedDiff";
import { bigHunkDiff } from "./sample";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 3f9a21c..9e0b7d4 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,4 +10,5 @@ export function retryJob(job: Job) {
   const max = job.maxAttempts;
-  for (let i = 0; i < max; i++) {
+  for (let i = 1; i <= max; i++) {
+    log(i);
     run(job);

@@ -40 +41,2 @@
-  return null;
+  return result;
+}
\\ No newline at end of file
`;

describe("parseUnifiedDiff", () => {
  const hunks = parseUnifiedDiff(DIFF);

  it("reads hunk headers, including the one-line short form", () => {
    expect(hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [10, 4, 10, 5],
      [40, 1, 41, 2],
    ]);
    expect(hunks[0].section).toBe("export function retryJob(job: Job) {");
  });

  it("numbers old and new lines separately and keeps a stripped empty context line", () => {
    const rows = hunks[0].lines.map((l) => [l.kind, l.old, l.new]);
    expect(rows).toEqual([
      ["ctx", 10, 10],
      ["del", 11, null],
      ["add", null, 11],
      ["add", null, 12],
      ["ctx", 12, 13],
      ["ctx", 13, 14],
    ]);
    expect(hunks[1].lines.at(-1)).toMatchObject({ kind: "note", text: "No newline at end of file" });
  });

  it("highlights only the changed words of a paired line", () => {
    const [del, add] = hunks[0].lines.slice(1, 3);
    expect(del.spans?.filter((s) => s.hit).map((s) => s.text)).toEqual(["0; i <"]);
    expect(add.spans?.filter((s) => s.hit).map((s) => s.text)).toEqual(["1; i <="]);
    // The unpaired added line gets no highlight.
    expect(hunks[0].lines[3].spans).toBeUndefined();
  });

  it("parses a 2,000-line diff quickly", () => {
    const text = bigHunkDiff(2000).diff;
    const start = performance.now();
    const big = parseUnifiedDiff(text);
    expect(big.reduce((n, h) => n + h.lines.length, 0)).toBeGreaterThanOrEqual(2000);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
