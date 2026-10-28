import fs from "node:fs";
import path from "node:path";
import type * as TypeScript from "typescript";
import { queryEvidenceSlice } from "../../analysis/evidence-slice";
import { DEFAULT_BOUNDARY_POLICY, scopePolicy, type EvidenceGap, type ProgramElement, type ProgramRelation } from "../../analysis/scope-seam";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import {
  selectExpressionResultSchema,
  valueFlowResultSchema,
  type LedgerRow,
  type SelectExpressionResult,
  type ValueFlowResult,
} from "../contracts/value-flow";
import { EngineError } from "../protocol";
import { createCallSiteIndex, describeSites, singleCall, type CallSiteIndex, type CallSites } from "../call-sites";
import { elementsAt, externalCallee, naturalEnd, needsOneCallSite, pairedInSlice, seedFor } from "../facts";
import { elementTraits, relationTraits } from "../kinds";
import type { HostCandidate } from "../host";
import { candidatesAt, parseSpan, sameSpan, sourceFileFor, spanOf, type Span } from "../selection";
import { checkGeneration, requireTypescript, type BaseTier1, type EngineSession, type Tier1, type TsTier1 } from "../session";

/** Ledgers bigger than this are refused as `budget-exhausted`, never truncated. */
export const LEDGER_MAX_BYTES = 2 * 1024 * 1024;

/** Relation kinds the walk follows, in this order of preference (plan 6-M3 step 4). */
const FOLLOW = [
  "field-input", "consumer-value", "alias", "references", "for-element", "for-callback-parameter", "show-when",
  "show-render-parameter", "component-prop", "component-prop-binding", "render-terminal", "renders", "performs",
  "pack-field", "map-element", "map-callback-parameter", "map-result", "filter-result", "find-result",
  "includes-membership", "join-source", "accessor-call", "resource-source-parameter", "context-value", "framework-flow",
];
const MAX_ROWS = 64;
const callSiteIndexes = new WeakMap<TsTier1, CallSiteIndex>();

function base(tier1: BaseTier1) {
  return {
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
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
      text: candidate.text.length > 240 ? `${candidate.text.slice(0, 239)}…` : candidate.text,
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
  const builder = new LedgerBuilder(tier1, cancellation);
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

class LedgerBuilder {
  private rows: LedgerRow[] = [];
  /** Elements the forward walk visited: a dead end counts only where the walk went. */
  private readonly visited = new Set<string>();
  private readonly root: string;

  constructor(private readonly tier1: Tier1, private readonly cancellation?: AnalysisCancellationToken) {
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
      this.add({ kind, label: part.text, file, span: part.span, status: "proven", elementId: fact?.id ?? null, typeText: host.typeTextAt(file, part.span), note: null });
    }
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
    if (!seed) {
      return this.finish(selection, "unsupported", "no-evidence-element", { elements: 0, relations: 0, limit: 0, used: 0, exhausted: false });
    }
    return this.forward(selection, seed, span);
  }

  /** Where the value goes: the forward evidence slice, walked in operation order. */
  private forward(selection: ValueFlowResult["selection"], seed: string, span: Span): ValueFlowResult {
    const slice = queryEvidenceSlice(this.tier1.provider(), {
      seed: { candidateId: `value-flow:${seed}`, entryElementId: seed, adapter: "value-flow", label: selection.text, framework: null, proof: [], defaults: scopePolicy({ direction: "forward" }) },
      direction: "forward",
      terminalPolicy: { roles: ["render", "component-occurrence", "side-effect", "return"] },
      cancellation: this.cancellation,
    });
    this.rows[0].proof = slice.elements.find((element) => element.id === seed)?.proof ?? [];
    this.walk(seed, slice.elements, slice.relations, span);
    this.deadEnds(slice.elements, slice.gaps);
    const exhausted = slice.coverage.truncation.budget;
    const outcome = this.rows.some((row) => row.kind === "boundary") ? "partial" : this.rows.some((row) => row.kind === "terminal") ? "ok" : exhausted ? "budget" : "partial";
    return this.finish(selection, outcome, null, {
      elements: slice.elements.length,
      relations: slice.relations.length,
      limit: DEFAULT_BOUNDARY_POLICY.maxRelations,
      used: slice.relations.length,
      exhausted,
    });
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
        this.add({
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
        this.add({ kind: "branch", label: text(n.condition), file, ...at(n), typeText: this.typeText(n), note: `${text(n.whenTrue)} when true, ${text(n.whenFalse)} otherwise` });
        visit(n.whenTrue);
        visit(n.whenFalse);
        return;
      }
      if (ts.isNonNullExpression(n)) {
        visit(n.expression);
        this.add({
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
        this.add({ kind: "transfer", label: text(n), file, ...at(n), typeText: this.typeText(n), note: `field read of ${ts.isPropertyAccessExpression(n) ? `.${n.name.text}` : text(n.argumentExpression)} from ${text(n.expression)}` });
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
   * call into first-party code is a transform when the evidence pairs its
   * return with this call (T13) or it has one call site, and a boundary
   * (unproven-handoff) otherwise (R7).
   */
  private composeCall(sourceFile: TypeScript.SourceFile, file: string, call: TypeScript.CallExpression, at: { span: Span; elementId: string | null; status: LedgerRow["status"] }) {
    const { ts } = this.typescript;
    const callee = call.expression.getText(sourceFile);
    const typeText = this.typeText(call);
    if (call.arguments.length === 0) {
      this.add({ kind: "transfer", label: call.getText(sourceFile), file, ...at, typeText, note: `reads the accessor ${callee}` });
      return;
    }
    const declaration = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression);
    const target = declaration?.valueDeclaration ?? declaration?.declarations?.[0];
    const targetFile = target?.getSourceFile();
    const firstParty = targetFile && !targetFile.isDeclarationFile && !targetFile.fileName.includes(`${path.sep}node_modules${path.sep}`);
    if (!firstParty) {
      this.add({ kind: "boundary", label: `${callee}(…)`, file, ...at, status: "partial", typeText, reason: "external-code", note: `${callee} is outside the program's own source; its return is not traced` });
      return;
    }
    const sites = this.sites.forCall(call);
    // Where the evidence pairs calls, this call's result is its own callee's return for this call alone (T13).
    if (this.tier1.host.evidence.pairsCalls || singleCall(sites)) {
      this.add({ kind: "transform", label: `${callee}(…)`, file, ...at, typeText, note: singleCall(sites) ? `through ${callee}, which has one call site` : `through ${callee}, paired with this call` });
      return;
    }
    this.add({ kind: "boundary", label: `${callee}(…)`, file, ...at, status: "partial", typeText, reason: "unproven-handoff", note: describeSites(callee, sites) });
  }

  /**
   * The same rule as the anchor graph (R16): a `disconnected` gap is a dead
   * end unless the element is where a value naturally begins. A dead end is a
   * boundary row, so the ledger and the graph agree on where a path stops.
   */
  private deadEnds(elements: readonly ProgramElement[], gaps: readonly EvidenceGap[]) {
    const byId = new Map(elements.map((element) => [element.id, element]));
    for (const gap of gaps) {
      if (gap.reason !== "disconnected" || !gap.from || !gap.location) continue;
      const element = byId.get(gap.from);
      // Only where the ledger's own walk went: a gap past a boundary it already stopped at is not a second stop.
      if (!element || !this.visited.has(element.id) || naturalEnd(this.tier1, element) || this.rows.some((row) => row.kind === "boundary" && row.elementId === element.id)) continue;
      if (this.rows.length >= MAX_ROWS) return;
      const callee = externalCallee(this.tier1, element);
      this.add({
        kind: "boundary",
        label: element.label,
        file: element.location.file,
        span: element.location.span,
        status: "partial",
        elementId: element.id,
        proof: gap.proof,
        typeText: null,
        reason: callee ? "external-code" : "disconnected",
        note: callee ? `${callee} is outside the program's own source; its return is not traced` : "dead end · nothing continues from here",
      });
    }
  }

  /** The forward slice from the seed, depth first, in FOLLOW order; dead ends are dropped. */
  private walk(seed: string, elements: readonly ProgramElement[], relations: readonly ProgramRelation[], seedSpan: Span) {
    const byId = new Map(elements.map((element) => [element.id, element]));
    const out = new Map<string, ProgramRelation[]>();
    for (const relation of relations) {
      if (relation.kind === "contains" || relation.kind === "declares-parameter") continue;
      (out.get(relation.from) ?? out.set(relation.from, []).get(relation.from)!).push(relation);
    }
    const rank = (kind: string) => (relationTraits(kind).crossCall ? FOLLOW.length : FOLLOW.indexOf(kind) < 0 ? FOLLOW.length + 1 : FOLLOW.indexOf(kind));
    const visited = this.visited;
    visited.add(seed);
    const crossed = new Set<CallSites | string>();
    type Step = { relation: ProgramRelation; element: ProgramElement; kind: LedgerRow["kind"]; note: string | null; reason: string | null };
    // Returns the steps of one path that ends at a terminal or a boundary, or null for a dead end.
    const descend = (from: string, depth: number): Step[][] => {
      if (depth > DEFAULT_BOUNDARY_POLICY.maxDepth) return [];
      const paths: Step[][] = [];
      // A cross-call's `argument` (to the call) sorts before its `argument-binding` (to the parameter), so the boundary sits at the call.
      const order = (kind: string) => rank(kind) * 2 + (kind === "argument-binding" ? 1 : 0);
      for (const relation of [...(out.get(from) ?? [])].sort((a, b) => order(a.kind) - order(b.kind))) {
        if (visited.has(relation.to)) continue;
        const element = byId.get(relation.to);
        if (!element) continue;
        visited.add(relation.to);
        if (needsOneCallSite(relation.kind, this.tier1.host.evidence.pairsCalls)) {
          const { sites, name } = this.sitesOfElement(element);
          if (!singleCall(sites) && !pairedInSlice(sites, elements)) {
            // One boundary per callee, however many relations lead into it.
            const key = sites ?? element.id;
            if (!crossed.has(key)) {
              crossed.add(key);
              paths.push([{ relation, element, kind: "boundary", reason: "unproven-handoff", note: describeSites(name, sites) }]);
            }
            continue;
          }
        }
        // Bookkeeping elements at the seed's own span repeat the input.
        const terminal = Boolean(elementTraits(element.kind).terminal) || element.terminalRoles.length > 0;
        const repeatsInput = sameSpan(element.location.span, seedSpan) && !terminal;
        // A return the slice carried on from (to its paired call) is a transfer, not where the value leaves (T13).
        const returnsToCaller = element.kind === "return" && (out.get(element.id) ?? []).some((item) => item.kind === "return-value");
        if (terminal && !returnsToCaller) {
          if (relation.status === "proven" || element.kind !== "jsx-occurrence") paths.push([{ relation, element, kind: "terminal", reason: null, note: terminalNote(element) }]);
          continue;
        }
        for (const rest of descend(relation.to, depth + 1)) {
          paths.push(repeatsInput ? rest : [{ relation, element, kind: classify(relation, element), reason: null, note: null }, ...rest]);
        }
      }
      return paths;
    };
    const seen = new Set<string>();
    for (const steps of descend(seed, 0)) {
      for (const step of steps) {
        if (this.rows.length >= MAX_ROWS) return;
        const key = `${step.kind}|${step.element.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.add({
          kind: step.kind,
          label: step.element.label,
          file: step.element.location.file,
          span: step.element.location.span,
          status: step.kind === "boundary" ? "partial" : step.relation.status,
          elementId: step.element.id,
          relationId: step.relation.id,
          proof: [step.relation.proof],
          note: step.note,
          reason: step.reason,
        });
      }
    }
  }

  private sitesOfElement(element: ProgramElement): { sites: CallSites | null; name: string } {
    return this.tier1.host.callSitesOf(element);
  }

  private typeText(node: TypeScript.Node): string | null {
    try {
      const text = this.checker.typeToString(this.checker.getTypeAtLocation(node));
      return text.length > 160 ? `${text.slice(0, 159)}…` : text;
    } catch {
      return null;
    }
  }

  private add(row: Omit<LedgerRow, "id" | "absPath" | "line" | "elementId" | "relationId" | "proof" | "typeText" | "note" | "reason"> & Partial<LedgerRow>) {
    this.rows.push({
      elementId: null,
      relationId: null,
      proof: [],
      typeText: null,
      note: null,
      reason: null,
      ...row,
      id: `row:${this.rows.length + 1}`,
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
    const files = [...new Set([selection.file, ...this.rows.map((row) => row.file)])];
    return valueFlowResultSchema.parse({
      outcome,
      ...base(this.tier1),
      reason,
      selection,
      rows: this.rows,
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

function classify(relation: ProgramRelation, element: ProgramElement): LedgerRow["kind"] {
  if (relation.kind === "show-when" || element.kind === "type-narrow") return "branch";
  if (relationTraits(relation.kind).role === "transform" || element.kind === "selection" || element.kind === "object-pack") return "transform";
  return "transfer";
}

function terminalNote(element: ProgramElement): string {
  if (element.kind === "render-terminal") return "JSX render slot";
  if (element.kind === "dom-terminal") return "DOM attribute or property";
  if (element.kind === "component-occurrence") return "handed to a component";
  if (element.kind === "side-effect") return "side effect";
  if (element.terminalRoles.includes("http-response")) return "HTTP response";
  if (element.terminalRoles.includes("stdout")) return "printed";
  if (element.terminalRoles.includes("file-write")) return "written to a file";
  if (element.terminalRoles.includes("side-effect")) return "side effect";
  return "returned";
}

function fingerprint(root: string, file: string) {
  try {
    const stat = fs.statSync(path.resolve(root, file));
    return { file, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { file, size: 0, mtimeMs: 0 };
  }
}
