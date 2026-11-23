import fs from "node:fs";
import path from "node:path";
import type * as TypeScript from "typescript";
import { type EvidenceProof } from "../../analysis/scope-seam";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../../analysis/cancellation";
import { projectProofs } from "../../api/projections/route-totality-evidence-projection";
import {
  selectExpressionResultSchema,
  valueFlowResultSchema,
  type LedgerRow,
  type SelectExpressionResult,
  type ValueFlowResult,
} from "../contracts/value-flow";
import { EngineError } from "../protocol";
import { toSliceElement } from "../../analysis/evidence-slice-normalization";
import type { AnchorEdge, AnchorGraphResult, AnchorNode } from "../contracts/anchor-graph";
import { anchorGraphOp } from "./anchor-graph";
import { createCallSiteIndex, describeSites, singleCall, type CallSiteIndex } from "../call-sites";
import { elementsAt, IN_PLACE_NOTES, seedFor, standardLibraryCall } from "../facts";
import type { HostCandidate } from "../host";
import { candidatesAt, clipText, parseSpan, sameSpan, sourceFileFor, spanOf, type Span } from "../selection";
import { checkGeneration, requireTypescript, type BaseTier1, type EngineSession, type Tier1, type TsTier1 } from "../session";

/** Ledgers bigger than this are refused as `budget-exhausted`, never truncated. */
export const LEDGER_MAX_BYTES = 2 * 1024 * 1024;

/** Relation kinds the walk follows, in this order of preference (plan 6-M3 step 4). */
const FOLLOW = [
  "field-input", "consumer-value", "references", "for-element", "for-callback-parameter", "show-when",
  "show-render-parameter", "component-prop", "component-prop-binding", "render-terminal", "renders", "performs",
  "pack-field", "map-element", "map-callback-parameter", "map-result", "filter-result", "find-result",
  "includes-membership", "join-source", "accessor-call", "context-value", "framework-flow", "member-state",
];
const MAX_ROWS = 64;
const callSiteIndexes = new WeakMap<TsTier1, CallSiteIndex>();

function base(tier1: BaseTier1) {
  return {
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    nullProof: tier1.generation.nullProof,
  };
}

export function selectExpressionOp(session: EngineSession, params: Record<string, unknown>): SelectExpressionResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const { relative } = tier1.host.file(params.file);
  const span = parseSpan(params.span);
  const candidates = tier1.host.candidates(relative, span, typeof params.text === "string" ? params.text : null);
  const supported = tier1.language === "python"
    ? "names, attribute reads, literal subscripts, calls, or / and, conditional expressions, await, parameters"
    : "identifiers, property reads, calls, ??, ||, ?:, !, JSX expressions";
  return selectExpressionResultSchema.parse({
    outcome: candidates.length ? "ok" : "unsupported",
    ...base(tier1),
    file: relative,
    reason: candidates.length ? null : `No supported expression at this selection (${supported}).`,
    candidates: candidates.map((candidate) => ({
      kind: candidate.kind,
      text: clipText(candidate.text),
      span: candidate.span,
      evidence: elementsAt(tier1, relative, candidate.span).length > 0,
    })),
  });
}

export function valueFlowOp(session: EngineSession, params: Record<string, unknown>, cancellation?: AnalysisCancellationToken): ValueFlowResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const span = parseSpan(params.span);
  const text = typeof params.text === "string" ? params.text : null;
  const unsupported = () => new EngineError("unsupported-selection", "The selection is not exactly one supported expression; pick a candidate from selectExpression", { span });
  // The anchor graph for the same selection holds the answer: the ledger names its outcome, stops and ends, so the two never disagree.
  // Over its byte bound the graph throws `budget-exhausted`, and so does the ledger: the same answer.
  const graph = () => anchorGraphOp(session, { file: params.file, span, text: text ?? undefined, direction: "forward" }, cancellation);
  const builder = new LedgerBuilder(tier1, graph, cancellation);
  let result: ValueFlowResult;
  if (tier1.language === "typescript") {
    const { sourceFile, relative } = sourceFileFor(tier1, params.file);
    const candidate = candidatesAt(tier1.ts, sourceFile, span, text).find((item) => sameSpan(item.span, span));
    if (!candidate) throw unsupported();
    result = builder.build(sourceFile, relative, candidate.node, candidate.kind);
  } else {
    const { relative } = tier1.host.file(params.file);
    const candidate = tier1.host.candidates(relative, span, text).find((item) => sameSpan(item.span, span));
    if (!candidate) throw unsupported();
    result = builder.buildFromHost(relative, candidate);
  }
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > LEDGER_MAX_BYTES) throw new EngineError("budget-exhausted", `The ledger is ${bytes} bytes, over the ${LEDGER_MAX_BYTES}-byte bound`, { rows: result.rows.length });
  return result;
}

type LedgerDraft = Omit<LedgerRow, "proof"> & { proof: EvidenceProof[] };

class LedgerBuilder {
  private rows: LedgerDraft[] = [];
  private parts: Parameters<LedgerBuilder["add"]>[0][] = [];
  private readonly root: string;

  constructor(private readonly tier1: Tier1, private readonly graph: () => AnchorGraphResult, private readonly cancellation?: AnalysisCancellationToken) {
    this.root = tier1.root;
  }

  /** The TypeScript build: the ledger's syntax rows read the Program's nodes and checker. */
  private get typescript(): TsTier1 {
    return requireTypescript(this.tier1, "A TypeScript ledger");
  }

  private get checker(): TypeScript.TypeChecker {
    return this.typescript.program.getTypeChecker();
  }

  private get sites(): CallSiteIndex {
    const tier1 = this.typescript;
    return callSiteIndexes.get(tier1) ?? callSiteIndexes.set(tier1, createCallSiteIndex(tier1)).get(tier1)!;
  }

  /**
   * A ledger from the language host alone (Python): the input row, the parts
   * of the selection from the host's expression table, then the same forward
   * slice walk the TypeScript ledger uses.
   */
  buildFromHost(file: string, candidate: HostCandidate): ValueFlowResult {
    const { host } = this.tier1;
    const span = candidate.span;
    const seed = seedFor(this.tier1, file, span);
    const selection = { file, span, text: candidate.text, kind: candidate.kind };
    this.add({ kind: "input", label: candidate.text, file, span, status: seed ? "proven" : "partial", elementId: seed, typeText: host.typeTextAt(file, span), note: null });
    // What the selection is made of, innermost first; a bare name is the value itself, not a step.
    for (const part of host.parts(file, span)) {
      if (part.kind === "Name") continue;
      const fact = elementsAt(this.tier1, file, part.span)[0];
      const kind: LedgerRow["kind"] = part.kind === "BoolOp" ? "fallback" : part.kind === "IfExp" ? "branch" : part.kind === "Call" ? "transform" : "transfer";
      this.part({ kind, label: part.text, file, span: part.span, status: "proven", elementId: fact?.id ?? null, typeText: host.typeTextAt(file, part.span), note: null });
    }
    this.flushParts();
    if (!seed) return this.finish(selection, "unsupported", "no-evidence-element", { elements: 0, relations: 0, limit: 0, used: 0, exhausted: false });
    return this.forward(selection, seed, span);
  }

  build(sourceFile: TypeScript.SourceFile, file: string, node: TypeScript.Node, kind: string): ValueFlowResult {
    const { ts } = this.typescript;
    const span = spanOf(sourceFile, node);
    const seed = seedFor(this.tier1, file, span);
    const selection = { file, span, text: node.getText(sourceFile), kind };
    this.add({
      kind: "input",
      label: node.getText(sourceFile),
      file,
      span,
      status: seed ? "proven" : "partial",
      elementId: seed,
      typeText: this.typeText(node),
      note: ts.isPropertyAccessExpression(node) ? `reads .${node.name.text} from ${node.expression.getText(sourceFile)}` : null,
    });
    // What the selected expression is made of, in evaluation order.
    this.compose(sourceFile, file, ts.isPropertyAccessExpression(node) ? node.expression : node, node);
    this.flushParts();
    if (!seed) {
      return this.finish(selection, "unsupported", "no-evidence-element", { elements: 0, relations: 0, limit: 0, used: 0, exhausted: false });
    }
    return this.forward(selection, seed, span);
  }

  /**
   * Where the value goes: the anchor graph for the same selection, laid out
   * as rows. Its steps depth first in FOLLOW order, each with its edge's
   * relation, status and proof; then every end it lands at and every stop it
   * names (a frontier, a boundary it could not pass). The ledger has no walk
   * of its own, so its outcome, steps, ends and stops are the graph's.
   */
  private forward(selection: ValueFlowResult["selection"], seed: string, span: Span): ValueFlowResult {
    const graph = this.graph();
    const indexed = this.tier1.provider().factIndex.getElement(seed);
    this.rows[0].proof = indexed ? toSliceElement(indexed).proof : [];
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const anchor = graph.nodes.find((node) => node.kind === "anchor");
    const into = new Map<string, AnchorEdge>();
    const out = new Map<string, AnchorEdge[]>();
    for (const edge of graph.edges) {
      if (!into.has(edge.target)) into.set(edge.target, edge);
      (out.get(edge.source) ?? out.set(edge.source, []).get(edge.source)!).push(edge);
    }
    const roles = new Map(graph.terminals.map((end) => [end.nodeId, end.roles]));
    const rank = (kind: string) => (FOLLOW.indexOf(kind) < 0 ? FOLLOW.length : FOLLOW.indexOf(kind));
    const isStop = (node: AnchorNode) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven");
    const written = new Set<string>();
    const row = (node: AnchorNode, edge: AnchorEdge | undefined, kind: LedgerRow["kind"]) => {
      written.add(node.id);
      this.add({
        kind,
        label: node.label,
        file: node.file,
        span: node.span,
        status: kind === "boundary" ? "partial" : edge?.status === "proven" ? "proven" : edge?.status === "unsupported" ? "unsupported" : "partial",
        // A frontier is hung off the element it stopped at.
        elementId: node.kind === "frontier" ? (edge?.source ?? null) : node.id,
        relationId: edge && edge.kind !== "gap" ? edge.id : null,
        proof: (edge?.proof ?? []).filter(Boolean) as EvidenceProof[],
        reason: kind === "boundary" ? (node.reason ?? "partial-proof") : null,
        note: kind === "terminal" ? (node.note ?? terminalNote(node.elementKind, roles.get(node.id) ?? [])) : kind === "boundary" ? node.note : null,
      });
    };
    // The steps, depth first from the anchor: a path is written only when it reaches an end or a stop.
    const seen = new Set(anchor ? [anchor.id] : []);
    const descend = (from: string): [AnchorNode, AnchorEdge][][] => {
      const paths: [AnchorNode, AnchorEdge][][] = [];
      for (const edge of [...(out.get(from) ?? [])].sort((a, b) => rank(a.kind) - rank(b.kind))) {
        const node = nodes.get(edge.target);
        if (!node || node.kind === "scope" || seen.has(node.id)) continue;
        seen.add(node.id);
        if (node.kind === "terminal" || isStop(node)) paths.push([[node, edge]]);
        else for (const rest of descend(node.id)) paths.push([[node, edge], ...rest]);
      }
      return paths;
    };
    // Steps and ends in path order; stops go last, so no stop reads as if a later step went on from it.
    const omitted = new Set<string>();
    for (const path of anchor ? descend(anchor.id) : []) {
      for (const [node, edge] of path) {
        if (written.has(node.id) || isStop(node)) continue;
        if (node.kind !== "terminal" && this.rows.length >= MAX_ROWS) {
          omitted.add(node.id);
          continue;
        }
        row(node, edge, node.kind === "terminal" ? "terminal" : node.kind === "transform" ? "transform" : edge.kind === "show-when" || node.elementKind === "type-narrow" ? "branch" : "transfer");
      }
    }
    // First, so the ledger's short view shows it.
    if (omitted.size) this.rows[0].note = [`${omitted.size} more step${omitted.size === 1 ? "" : "s"} not listed (the ledger lists ${MAX_ROWS} rows); every end and stop is`, this.rows[0].note].filter(Boolean).join(" · ");
    // Every end the graph names, reached above or not.
    for (const node of graph.nodes) if (node.kind === "terminal" && !written.has(node.id)) row(node, into.get(node.id), "terminal");
    // A value the code ends where it is selected (never read, a branch test, thrown) lands at the input itself, as the graph notes on its anchor.
    if (anchor?.note && Object.values(IN_PLACE_NOTES).includes(anchor.note as never)) {
      this.add({ kind: "terminal", label: this.rows[0].label, file: this.rows[0].file, span: this.rows[0].span, status: "proven", elementId: seed, proof: this.rows[0].proof, note: anchor.note });
    }
    // Every stop the graph names.
    for (const node of graph.nodes) if (isStop(node) && !written.has(node.id)) row(node, into.get(node.id), "boundary");
    const { coverage } = graph;
    return this.finish(selection, graph.outcome, graph.reason, { elements: coverage.elements, relations: coverage.relations, limit: coverage.budget.limit, used: coverage.budget.used, exhausted: coverage.budget.exhausted });
  }

  /** Rows for the expression's own parts: fallbacks, branches, assertions, calls, reads. */
  private compose(sourceFile: TypeScript.SourceFile, file: string, node: TypeScript.Node, selected: TypeScript.Node) {
    const { ts } = this.typescript;
    const text = (n: TypeScript.Node) => n.getText(sourceFile);
    // A part of the selection is a fact of syntax: proven by the AST even
    // where the collector recorded no evidence element at its exact span.
    const at = (n: TypeScript.Node) => {
      const span = spanOf(sourceFile, n);
      const fact = elementsAt(this.tier1, file, span)[0];
      const location = { file, line: span.startLine, column: span.startColumn, span };
      return {
        span,
        elementId: fact?.id ?? null,
        status: "proven" as LedgerRow["status"],
        proof: fact ? [] : [{ kind: "syntax", detail: `The TypeScript AST has a ${ts.SyntaxKind[n.kind]} here.`, locations: [location], status: "proven" as const }],
      };
    };
    const visit = (n: TypeScript.Node) => {
      if (ts.isParenthesizedExpression(n) || ts.isJsxExpression(n)) {
        if (n.expression) visit(n.expression);
        return;
      }
      if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
        visit(n.left);
        visit(n.right);
        const nullish = n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken;
        this.part({
          kind: "fallback",
          label: `${text(n.left)} ${nullish ? "??" : "||"} ${text(n.right)}`,
          file,
          ...at(n),
          typeText: this.typeText(n),
          note: nullish
            ? `?? keeps 0, "" and false from ${text(n.left)}; only null and undefined become ${text(n.right)}`
            : `|| replaces every falsy ${text(n.left)} (0, "", false, NaN) with ${text(n.right)}`,
        });
        return;
      }
      if (ts.isConditionalExpression(n)) {
        visit(n.condition);
        this.part({ kind: "branch", label: text(n.condition), file, ...at(n), typeText: this.typeText(n), note: `${text(n.whenTrue)} when true, ${text(n.whenFalse)} otherwise` });
        visit(n.whenTrue);
        visit(n.whenFalse);
        return;
      }
      if (ts.isNonNullExpression(n)) {
        visit(n.expression);
        this.part({
          kind: "branch",
          label: text(n),
          file,
          ...at(n),
          typeText: this.typeText(n),
          note: `assertion, not a check: ! removes null and undefined from ${text(n.expression)}'s type without testing the value`,
        });
        return;
      }
      if (ts.isCallExpression(n)) {
        for (const argument of n.arguments) visit(argument);
        this.composeCall(sourceFile, file, n, at(n));
        return;
      }
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
        visit(n.expression);
        if (n === selected) return;
        this.part({ kind: "transfer", label: text(n), file, ...at(n), typeText: this.typeText(n), note: `field read of ${ts.isPropertyAccessExpression(n) ? `.${n.name.text}` : text(n.argumentExpression)} from ${text(n.expression)}` });
        return;
      }
      if (ts.isBinaryExpression(n)) {
        visit(n.left);
        visit(n.right);
      }
    };
    visit(node);
  }

  /**
   * A call inside the selection. A zero-argument call reads an accessor; a
   * standard-library call is a transform; a call into first-party code is a
   * transform when the evidence pairs its return with this call (T13) or it
   * has one call site. Any other call is still a transform, marked partial
   * and named (external-code, unproven-handoff, R7): it says how the value
   * was made, not where it goes, so it is never a forward stop.
   */
  private composeCall(sourceFile: TypeScript.SourceFile, file: string, call: TypeScript.CallExpression, at: { span: Span; elementId: string | null; status: LedgerRow["status"] }) {
    const { ts } = this.typescript;
    const callee = call.expression.getText(sourceFile);
    const typeText = this.typeText(call);
    if (call.arguments.length === 0) {
      this.part({ kind: "transfer", label: call.getText(sourceFile), file, ...at, typeText, note: `reads the accessor ${callee}` });
      return;
    }
    const declaration = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression);
    const target = declaration?.valueDeclaration ?? declaration?.declarations?.[0];
    const targetFile = target?.getSourceFile();
    const firstParty = targetFile && !targetFile.isDeclarationFile && !targetFile.fileName.includes(`${path.sep}node_modules${path.sep}`);
    // As the graph's: the standard library is known, its value derives from what it is given (`standardLibraryCall`).
    if (!firstParty && standardLibraryCall(this.tier1, { kind: "call", location: { file, line: at.span.startLine, column: at.span.startColumn, span: at.span } })) {
      this.part({ kind: "transform", label: `${callee}(…)`, file, ...at, typeText, note: `through ${callee}, from the standard library` });
      return;
    }
    if (!firstParty) {
      this.part({ kind: "transform", label: `${callee}(…)`, file, ...at, status: "partial", typeText, reason: "external-code", note: `${callee} is outside the program's own source; its return is not traced` });
      return;
    }
    const sites = this.sites.forCall(call);
    // Where the evidence pairs calls, this call's result is its own callee's return for this call alone (T13).
    if (this.tier1.host.evidence.pairsCalls || singleCall(sites)) {
      this.part({ kind: "transform", label: `${callee}(…)`, file, ...at, typeText, note: singleCall(sites) ? `through ${callee}, which has one call site` : `through ${callee}, paired with this call` });
      return;
    }
    this.part({ kind: "transform", label: `${callee}(…)`, file, ...at, status: "partial", typeText, reason: "unproven-handoff", note: describeSites(callee, sites) });
  }

    private typeText(node: TypeScript.Node): string | null {
    try {
      const text = this.checker.typeToString(this.checker.getTypeAtLocation(node));
      return text.length > 160 ? `${text.slice(0, 159)}…` : text;
    } catch {
      return null;
    }
  }

  /** A row for a part of the selection, written by `flushParts`. */
  private part(row: Parameters<LedgerBuilder["add"]>[0]) {
    this.parts.push(row);
  }

  /**
   * The selection's parts, in evaluation order, within the row limit. When
   * they do not fit, the selection's own operation (the last part) comes
   * first, then its fallbacks and branches, then plain reads; the input row
   * says how many it left out. A selection with thousands of parts still
   * makes a small ledger.
   */
  private flushParts() {
    const room = Math.max(0, MAX_ROWS - this.rows.length);
    const rank = (index: number) => (index === this.parts.length - 1 ? 0 : this.parts[index].kind === "fallback" || this.parts[index].kind === "branch" ? 1 : 2);
    const kept = new Set(this.parts.map((_, index) => index).sort((a, b) => rank(a) - rank(b) || a - b).slice(0, room));
    this.parts.forEach((row, index) => kept.has(index) && this.add(row));
    const omitted = this.parts.length - kept.size;
    if (omitted) this.rows[0].note = [`${omitted} more part${omitted === 1 ? "" : "s"} of the selection not listed`, this.rows[0].note].filter(Boolean).join(" · ");
    this.parts = [];
  }

  private add(row: Omit<LedgerDraft, "id" | "absPath" | "line" | "elementId" | "relationId" | "proof" | "typeText" | "note" | "reason"> & Partial<LedgerDraft>) {
    this.rows.push({
      elementId: null,
      relationId: null,
      proof: [],
      typeText: null,
      reason: null,
      ...row,
      // Bounded words: a selection over a huge literal is still a small ledger.
      label: clip(row.label, 240),
      note: row.note ? clip(row.note, 400) : null,
      id: "",
      absPath: path.resolve(this.root, row.file),
      line: row.span.startLine,
    });
  }

  private finish(
    selection: ValueFlowResult["selection"],
    outcome: ValueFlowResult["outcome"],
    reason: string | null,
    coverage: { elements: number; relations: number; limit: number; used: number; exhausted: boolean },
  ): ValueFlowResult {
    this.rows.forEach((row, index) => (row.id = `row:${index + 1}`));
    const files = [...new Set([selection.file, ...this.rows.map((row) => row.file)])];
    const cancellation = this.cancellation ?? NO_ANALYSIS_CANCELLATION;
    return valueFlowResultSchema.parse({
      outcome,
      ...base(this.tier1),
      reason,
      // Bounded words: a selection over a huge literal is still a small ledger.
      selection: { ...selection, text: clip(selection.text, 240) },
      // Internal invocation tags disambiguate the walk but are not public evidence.
      rows: this.rows.map((row) => ({ ...row, proof: projectProofs(row.proof, cancellation) })),
      frontiers: this.rows.filter((row) => row.kind === "boundary").map((row) => ({ rowId: row.id, reason: row.reason ?? "partial-proof", label: row.label })),
      terminals: this.rows.filter((row) => row.kind === "terminal").map((row) => row.id),
      coverage: { elements: coverage.elements, relations: coverage.relations, budget: { limit: coverage.limit, used: coverage.used, exhausted: coverage.exhausted } },
      bindings: {
        tsconfig: this.tier1.generation.tsconfig,
        typescript: this.tier1.generation.typescript,
        sourceFingerprints: files.map((file) => fingerprint(this.root, file)),
      },
    });
  }
}

/** What an end the graph names is, by its element kind, when the graph gives it no note of its own. */
function terminalNote(kind: string | null, roles: readonly string[]): string {
  if (kind === "render-terminal") return "JSX render slot";
  if (kind === "dom-terminal") return "DOM attribute or property";
  if (kind === "branch-condition") return "decides which branch renders";
  if (kind === "component-occurrence") return "handed to a component";
  if (kind === "side-effect") return "side effect";
  if (roles.includes("http-response")) return "HTTP response";
  if (roles.includes("stdout")) return "printed";
  if (roles.includes("file-write")) return "written to a file";
  if (roles.includes("side-effect") || kind === "external-effect") return "side effect";
  return kind === "return" ? "returned" : (kind ?? "end").replaceAll("-", " ");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fingerprint(root: string, file: string) {
  try {
    const stat = fs.statSync(path.resolve(root, file));
    return { file, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { file, size: 0, mtimeMs: 0 };
  }
}
