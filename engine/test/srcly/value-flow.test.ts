import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ValueFlowResult } from "../../src/srcly/contracts/value-flow";
import { selectExpressionOp, valueFlowOp } from "../../src/srcly/ops/value-flow";
import { createEngineSession, type EngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

const basics = fileURLToPath(new URL("../../examples/value-flow-basics", import.meta.url));
const srclyClient = fileURLToPath(new URL("../../../client", import.meta.url));

function sessionFor(root: string, tsconfig: string | null = null) {
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig, typescriptFrom: chooseTypescript(root, source).from });
}

/**
 * The span of `text` on the first line of `file` that contains `marker`
 * (default: the text itself). A marker starting with "=" must be the whole
 * trimmed line, so `{props.node.name}` alone is not `title={props.node.name}`.
 */
function find(root: string, file: string, text: string, marker = text) {
  const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  const whole = marker.startsWith("=") ? marker.slice(1) : null;
  const index = lines.findIndex((line) => (whole ? line.trim() === whole : line.includes(marker)));
  if (index < 0) throw new Error(`${marker} is not in ${file}`);
  const column = lines[index].indexOf(text) + 1;
  return { file, text, span: { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length } };
}

const kinds = (ledger: ValueFlowResult) => ledger.rows.map((row) => row.kind);
const terminal = (ledger: ValueFlowResult) => ledger.rows.filter((row) => row.kind === "terminal");

describe("value-flow basics", () => {
  const session = sessionFor(basics);

  it("follows a prop read to its JSX text slot", () => {
    const ledger = valueFlowOp(session, find(basics, "src/direct-property.tsx", "props.item.title"));
    expect(ledger.outcome).toBe("ok");
    expect(kinds(ledger)).toEqual(["input", "transfer", "terminal"]);
    expect(terminal(ledger)[0]).toMatchObject({ status: "proven", note: "JSX render slot", line: 2 });
    expect(ledger.rows[1].label).toBe("props.item");
  }, 60_000);

  it("keeps two bindings with the same field name apart", () => {
    const left = valueFlowOp(session, find(basics, "src/same-name-negative.tsx", "props.left.name"));
    const right = valueFlowOp(session, find(basics, "src/same-name-negative.tsx", "props.right.name"));
    expect(terminal(left).map((row) => row.line)).toEqual([4]);
    expect(terminal(right).map((row) => row.line)).toEqual([5]);
    expect(left.rows.some((row) => row.label.includes("right"))).toBe(false);
  });

  it("says what ?? keeps and that ! is an assertion, not a check", () => {
    const fallback = valueFlowOp(session, find(basics, "src/null-vs-finite.tsx", "props.count ?? 0"));
    const row = fallback.rows.find((item) => item.kind === "fallback")!;
    expect(row.note).toContain("?? keeps 0");
    expect(row.status).toBe("proven");
    const asserted = valueFlowOp(session, find(basics, "src/null-vs-finite.tsx", "String(props.maybe!)"));
    const assertion = asserted.rows.find((item) => item.label === "props.maybe!")!;
    expect(assertion).toMatchObject({ kind: "branch" });
    expect(assertion.note).toMatch(/^assertion, not a check/);
  });

  it("stops at a helper with two call sites instead of joining them", () => {
    const ledger = valueFlowOp(session, find(basics, "src/two-call-helper.tsx", "props.a"));
    expect(ledger.outcome).toBe("partial");
    const boundary = ledger.rows.find((row) => row.kind === "boundary")!;
    expect(boundary).toMatchObject({ reason: "unproven-handoff", status: "partial" });
    expect(boundary.note).toContain("2 call sites");
    expect(ledger.rows.some((row) => row.kind === "terminal" && row.status === "proven" && row.line === 9)).toBe(false);
    expect(ledger.frontiers).toEqual([{ rowId: boundary.id, reason: "unproven-handoff", label: boundary.label }]);
  });

  it("names a dead end as a boundary row, so the ledger agrees with the anchor graph", () => {
    const ledger = valueFlowOp(session, find(basics, "src/dead-end.tsx", "props.label", "unused ="));
    expect(ledger.outcome).toBe("partial");
    const boundary = ledger.rows.find((row) => row.kind === "boundary")!;
    expect(boundary).toMatchObject({ reason: "disconnected", status: "partial", label: "unused", note: "dead end · nothing continues from here" });
    expect(ledger.frontiers).toEqual([{ rowId: boundary.id, reason: "disconnected", label: "unused" }]);
  });

  it("offers candidates innermost first and refuses a selection that is not one expression", () => {
    const caret = find(basics, "src/direct-property.tsx", "title", "props.item.title");
    const point = { ...caret.span, endColumn: caret.span.startColumn };
    const candidates = selectExpressionOp(session, { file: caret.file, span: point });
    expect(candidates.candidates.map((item) => item.text)).toEqual(["props.item.title", "{props.item.title}"]);
    expect(() => valueFlowOp(session, { file: caret.file, span: { ...caret.span, endColumn: caret.span.endColumn - 2 }, text: "props.item.tit" }))
      .toThrowError(expect.objectContaining({ code: "unsupported-selection" }));
  });

  it("refuses a stale generation by name", () => {
    expect(() => valueFlowOp(session, { ...find(basics, "src/direct-property.tsx", "props.item.title"), expectedGeneration: 99 }))
      .toThrowError(expect.objectContaining({ code: "stale-generation" }));
  });
});

describe.skipIf(!fs.existsSync(path.join(srclyClient, "src/components/HotSpotItem.tsx")))("value flow on srcly's own client (M3 acceptance)", () => {
  let session: EngineSession;
  const ledger = (file: string, text: string, marker?: string) => {
    session ??= sessionFor(srclyClient, "tsconfig.app.json");
    return valueFlowOp(session, find(srclyClient, file, text, marker));
  };

  it("135: props.node.name reaches the JSX text slot, proven, through the props.node read", () => {
    const result = ledger("src/components/HotSpotItem.tsx", "props.node.name", "={props.node.name}");
    expect(result.outcome).toBe("ok");
    expect(result.rows.map((row) => [row.kind, row.label, row.status])).toEqual([
      ["input", "props.node.name", "proven"],
      ["transfer", "props.node", "proven"],
      ["terminal", "props.node.name", "proven"],
    ]);
    expect(terminal(result)[0].note).toBe("JSX render slot");
  }, 120_000);

  it("134: title={props.node.name} is its own ledger ending at a DOM attribute", () => {
    const title = ledger("src/components/HotSpotItem.tsx", "props.node.name", "title={props.node.name}");
    const text = ledger("src/components/HotSpotItem.tsx", "props.node.name", "={props.node.name}");
    expect(terminal(title)[0].note).toBe("DOM attribute or property");
    expect(text.rows.some((row) => row.line === terminal(title)[0].line)).toBe(false);
  });

  it("130: props.rank ?? \"–\" is a proven fallback that keeps 0", () => {
    const row = ledger("src/components/HotSpotItem.tsx", "props.rank ?? \"–\"").rows.find((item) => item.kind === "fallback")!;
    expect(row.status).toBe("proven");
    expect(row.note).toContain("?? keeps 0");
  });

  it("145: value()! is labelled an assertion; formatMetricWithUnit is crossed only because it has one call site", () => {
    const result = ledger("src/components/HotSpotItem.tsx", "props.valueText ?? (value() === null ? \"N/A\" : formatMetricWithUnit(props.metric, value()!))");
    expect(result.rows.find((row) => row.label === "value()!")?.note).toMatch(/^assertion, not a check/);
    const call = result.rows.find((row) => row.label === "formatMetricWithUnit(…)")!;
    expect(call.kind).toBe("transform");
    expect(call.note).toContain("one call site");
  });

  it("HotSpotList.tsx:88: item.node stops at row(...), which has two call sites", () => {
    const result = ledger("src/components/HotSpotList.tsx", "item.node", "row(item.node");
    expect(result.outcome).toBe("partial");
    const boundary = result.rows.find((row) => row.kind === "boundary")!;
    expect(boundary.reason).toBe("unproven-handoff");
    expect(boundary.note).toMatch(/row has 2 call sites \(src\/components\/HotSpotList\.tsx:\d+, src\/components\/HotSpotList\.tsx:\d+\)/);
    expect(result.rows.some((row) => row.kind === "terminal")).toBe(false);
  });
});
