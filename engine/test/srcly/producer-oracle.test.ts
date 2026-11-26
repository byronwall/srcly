import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { AnchorGraphResult } from "../../src/srcly/contracts/anchor-graph";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { spanOf, type Span } from "../../src/srcly/selection";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";
import { isOpaque, runRoot, sourceFiles, spanKey } from "../helpers/oracle-runtime";

// The producer oracle: the trace card's answer, checked against running the code.
//
// For every field read in an example root (`a.b`, not one the code writes to or
// calls), the engine names the field's producers. When it gives a closed
// answer (`producersOpen` false, and no producer carries a caveat), the read
// can only ever hold one of those producers' values. The test runs the root
// (`test/helpers/oracle-runtime.ts`) and fails on any read that held a value
// no producer made. A proof the engine should not have closed fails here
// with the value that broke it, whether or not a fixture claims anything.

const example = (name: string) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
const ROOTS = ["value-flow-basics", "value-flow-js", "value-flow-loose", "value-flow-bare"];
/** How many closed answers must run, so a runtime that quietly runs nothing fails. Raise it as fixtures grow. */
const MIN_RAN: Record<string, number> = { "value-flow-basics": 30 };

type Claim = { read: string; file: string; line: number; text: string; producers: { key: string; text: string }[] };

/** Every field read in the file: not a write's target, not a callee, not a JSX tag name. */
function fieldReads(source: ts.SourceFile) {
  const reads: ts.PropertyAccessExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && !ts.isPrivateIdentifier(node.name)) {
      let top: ts.Node = node;
      while (ts.isParenthesizedExpression(top.parent) || ts.isNonNullExpression(top.parent) || ts.isAsExpression(top.parent)) top = top.parent;
      const parent = top.parent;
      const written = (ts.isBinaryExpression(parent) && parent.left === top && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) || ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent) || ts.isDeleteExpression(parent);
      const called = (ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isTaggedTemplateExpression(parent)) && (parent as ts.CallExpression).expression === top;
      const tag = ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent);
      if (!written && !called && !tag && !ts.isTypeNode(parent) && !ts.isExpressionWithTypeArguments(parent)) reads.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

const closed = (graph: AnchorGraphResult) => !graph.producersOpen && graph.producers.length > 0 && graph.producers.every((producer) => producer.caveats.length === 0);

describe.each(ROOTS)("producer oracle in %s", (name) => {
  it("every closed producer answer holds when the code runs", async () => {
    const root = example(name);
    const source = path.join(root, "src");
    const session = createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
    const program = requireTypescript(session.tier1(), "the producer oracle").program;

    const claims: Claim[] = [];
    let reads = 0;
    for (const file of sourceFiles(root)) {
      const sourceFile = program.getSourceFile(path.join(root, file));
      if (!sourceFile || sourceFile.isDeclarationFile) continue;
      for (const read of fieldReads(sourceFile)) {
        reads += 1;
        const span: Span = spanOf(sourceFile, read);
        const graph = anchorGraphOp(session, { file, text: read.getText(sourceFile), span, direction: "backward" });
        if (!("producers" in graph) || !closed(graph)) continue;
        const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
        const producers = graph.producers.map((producer) => {
          const node = nodes.get(producer.nodeId)!;
          return { key: spanKey(node.file, node.span), text: producer.text };
        });
        claims.push({ read: spanKey(file, span), file, line: span.startLine, text: read.getText(sourceFile), producers });
      }
    }

    const marked = new Set(claims.flatMap((claim) => [claim.read, ...claim.producers.map((producer) => producer.key)]));
    const { recorded, unmatched } = await runRoot(root, program, marked);

    const failures: string[] = [];
    let ran = 0;
    for (const claim of claims) {
      const seen = (recorded.get(claim.read) ?? []).filter((item) => !isOpaque(item.value));
      if (!seen.length) continue;
      ran += 1;
      const made = claim.producers.flatMap((producer) => recorded.get(producer.key) ?? []);
      // A value counts only if a producer made it in the same run, or while the modules loaded: another call's value proves nothing.
      const stray = seen.find((item) => !made.some((candidate) => (candidate.run === item.run || candidate.run === 0) && Object.is(candidate.value, item.value)));
      if (stray) failures.push(`${claim.file}:${claim.line} ${claim.text} held ${JSON.stringify(stray.value)}; the engine names only ${claim.producers.map((producer) => producer.text).join(", ")}${made.length ? ` (which made ${made.slice(0, 3).map((item) => JSON.stringify(item.value)).join(", ")})` : " (none ran)"}`);
    }

    console.log(`${name}: ${reads} field reads, ${claims.length} closed answers, ${ran} ran, ${failures.length} contradicted, ${unmatched.size} spans unmatched`);
    expect([...unmatched], "every producer and read span maps to an expression the runtime can wrap").toEqual([]);
    expect(failures).toEqual([]);
    // A runtime that stops running the code would pass with nothing checked.
    expect(ran, "closed answers whose read ran").toBeGreaterThanOrEqual(MIN_RAN[name] ?? 0);
  }, 300_000);
});
