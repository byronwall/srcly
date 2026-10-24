import path from "node:path";
import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { queryEvidenceSlice, type EvidenceSlice } from "../../analysis/evidence-slice";
import { DEFAULT_BOUNDARY_POLICY, scopePolicy, type EvidenceGap, type ProgramElement, type ProgramRelation } from "../../analysis/scope-seam";
import { createCallSiteIndex, describeSites, singleCall, type CallSiteIndex } from "../call-sites";
import { anchorGraphResultSchema, type AnchorDirection, type AnchorEdge, type AnchorGraphResult, type AnchorNode } from "../contracts/anchor-graph";
import { callSitesOfElement, CROSS_CALL, elementsAt, enclosingFunction, functionName, nodeAtSpan, seedFor, TERMINAL_KINDS } from "../facts";
import { EngineError } from "../protocol";
import { candidatesAt, parseSpan, sameSpan, sourceFileFor, spanOf, type Candidate, type Span } from "../selection";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/** Anchor graphs bigger than this are refused as `budget-exhausted`, never truncated. */
export const ANCHOR_GRAPH_MAX_BYTES = 8 * 1024 * 1024;
/** Structural relations: they place elements, they do not move values. */
const SKIP_RELATIONS = new Set(["contains", "declares-parameter", "definition"]);
/** Element kinds that branch or narrow a value rather than carry it. */
const CONTROL_KINDS = new Set(["type-narrow", "show-binding", "for-binding", "predicate-result"]);
/** Element kinds that reshape a value. */
const TRANSFORM_KINDS = new Set(["selection", "object-pack", "parse", "serialization", "validation", "call-result"]);
const DIRECTIONS: AnchorDirection[] = ["forward", "backward", "both"];
const callSiteIndexes = new WeakMap<Tier1, CallSiteIndex>();

type Side = "up" | "down";

export function anchorGraphOp(session: EngineSession, params: Record<string, unknown>, cancellation?: AnalysisCancellationToken): AnchorGraphResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const direction = parseDirection(params.direction);
  const { sourceFile, relative } = sourceFileFor(tier1, params.file);
  const candidate = resolveCandidate(tier1, sourceFile, params);
  const result = new AnchorGraphBuilder(tier1, cancellation).build(sourceFile, relative, candidate, direction);
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > ANCHOR_GRAPH_MAX_BYTES) {
    throw new EngineError("budget-exhausted", `The anchor graph is ${bytes} bytes, over the ${ANCHOR_GRAPH_MAX_BYTES}-byte bound`, { bytes, nodes: result.nodes.length });
  }
  return result;
}

function parseDirection(value: unknown): AnchorDirection {
  if (value === undefined) return "both";
  if (typeof value === "string" && (DIRECTIONS as string[]).includes(value)) return value as AnchorDirection;
  throw new EngineError("invalid-request", `params.direction must be one of ${DIRECTIONS.join(", ")}`);
}

/**
 * The expression to anchor at: an exact span (plus its text, as `valueFlow`
 * takes it), or a `name` on a `line` for a symbol picked from the import
 * graph or the treemap, where only the declaration's line is known.
 */
function resolveCandidate(tier1: Tier1, sourceFile: TypeScript.SourceFile, params: Record<string, unknown>): Candidate {
  const { ts } = tier1;
  if (typeof params.name === "string" && params.name) {
    if (!Number.isInteger(params.line) || (params.line as number) < 1) throw new EngineError("invalid-request", "params.name needs params.line");
    const found = identifierOnLine(ts, sourceFile, params.name, params.line as number);
    if (!found) throw new EngineError("not-found", `No ${params.name} on line ${params.line} of ${path.basename(sourceFile.fileName)}`);
    return found;
  }
  const span = parseSpan(params.span);
  const text = typeof params.text === "string" ? params.text : null;
  const candidates = candidatesAt(ts, sourceFile, span, text);
  const candidate = candidates.find((item) => sameSpan(item.span, span)) ?? candidates[0];
  if (!candidate) throw new EngineError("unsupported-selection", "No supported expression at this selection; pick a candidate from selectExpression", { span });
  return candidate;
}

/** The identifier `name` on `line`: a declaration's name first, else the first use. */
function identifierOnLine(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string, line: number): Candidate | null {
  const hits: TypeScript.Identifier[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node) && node.text === name && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === line) hits.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const declares = (id: TypeScript.Identifier) => {
    const p = id.parent;
    return (
      (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isClassDeclaration(p) || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) &&
      p.name === id
    );
  };
  const node = hits.find(declares) ?? hits[0];
  return node ? { node, kind: ts.SyntaxKind[node.kind], text: name, span: spanOf(sourceFile, node) } : null;
}

class AnchorGraphBuilder {
  private readonly nodes = new Map<string, AnchorNode>();
  private readonly edges: AnchorEdge[] = [];
  private readonly edgeKeys = new Set<string>();
  /** Bookkeeping elements at the anchor's own span stand for the anchor. */
  private readonly alias = new Map<string, string>();
  private readonly originRoles = new Map<string, string[]>();
  private readonly terminalRoles = new Map<string, string[]>();
  private readonly root: string;
  private readonly checker: TypeScript.TypeChecker;
  private readonly sites: CallSiteIndex;

  constructor(private readonly tier1: Tier1, private readonly cancellation?: AnalysisCancellationToken) {
    this.root = path.resolve(tier1.args.root);
    this.checker = tier1.program.getTypeChecker();
    this.sites = callSiteIndexes.get(tier1) ?? callSiteIndexes.set(tier1, createCallSiteIndex(tier1)).get(tier1)!;
  }

  build(sourceFile: TypeScript.SourceFile, file: string, candidate: Candidate, direction: AnchorDirection): AnchorGraphResult {
    const span = spanOf(sourceFile, candidate.node);
    const seed = seedFor(this.tier1, file, span);
    const fact = seed ? elementsAt(this.tier1, file, span).find((item) => item.id === seed) : undefined;
    const anchorId = seed ?? `anchor:${file}:${span.startLine}:${span.startColumn}`;
    const anchor = {
      file,
      absPath: path.resolve(this.root, file),
      span,
      text: clip(candidate.text),
      kind: candidate.kind,
      elementId: seed,
      typeText: this.typeTextOf(candidate.node),
    };
    this.addNode({
      id: anchorId,
      kind: "anchor",
      label: anchor.text,
      detail: syntaxWords(candidate.kind),
      parent: this.scopeFor(file, span, "seed"),
      file,
      line: span.startLine,
      span,
      status: seed ? "proven" : "partial",
      side: "seed",
      elementKind: fact?.kind ?? null,
      typeText: anchor.typeText,
      reason: seed ? null : "no-evidence-element",
      note: seed ? null : "The engine has no evidence element at exactly this expression, so nothing can be traced from it.",
    });
    const empty = { elements: 0, relations: 0, budget: { limit: 0, used: 0, exhausted: false } };
    if (!seed) return this.finish(anchor, direction, "unsupported", "no-evidence-element", empty);

    const sides: Side[] = direction === "forward" ? ["down"] : direction === "backward" ? ["up"] : ["up", "down"];
    const coverage = { elements: 0, relations: 0, budget: { limit: 0, used: 0, exhausted: false } };
    for (const side of sides) {
      const dir = side === "down" ? "forward" : "backward";
      const slice = queryEvidenceSlice(this.tier1.provider(), {
        seed: { candidateId: `anchor:${seed}:${dir}`, entryElementId: seed, adapter: "anchor-graph", label: anchor.text, framework: null, proof: [], defaults: scopePolicy({ direction: dir }) },
        direction: dir,
        ...(dir === "forward" ? { terminalPolicy: { roles: ["render", "component-occurrence", "side-effect", "return"] } } : {}),
        cancellation: this.cancellation,
      });
      this.walk(seed, slice, side, span);
      this.gaps(slice.gaps, side);
      coverage.elements += slice.elements.length;
      coverage.relations += slice.relations.length;
      coverage.budget.used += slice.relations.length;
      coverage.budget.limit += DEFAULT_BOUNDARY_POLICY.maxRelations;
      coverage.budget.exhausted ||= slice.coverage.truncation.budget;
    }
    const drawn = [...this.nodes.values()];
    const kinds = drawn.map((node) => node.kind);
    // A frontier, or a boundary the walk could not pass, leaves the proof partial; a framework boundary passed on proven relations does not.
    const stopped = drawn.some((node) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven"));
    const landed = (sides.includes("down") && kinds.includes("terminal")) || (sides.includes("up") && kinds.includes("origin"));
    const outcome = stopped ? "partial" : landed ? "ok" : coverage.budget.exhausted ? "budget" : "partial";
    return this.finish(anchor, direction, outcome, null, coverage);
  }

  /** Breadth first from the seed over the slice's relations, one side at a time; terminals, origins and boundaries end a path. */
  private walk(seed: string, slice: EvidenceSlice, side: Side, seedSpan: Span) {
    const byId = new Map(slice.elements.map((element) => [element.id, element]));
    const next = new Map<string, ProgramRelation[]>();
    for (const relation of slice.relations) {
      if (SKIP_RELATIONS.has(relation.kind)) continue;
      const key = side === "down" ? relation.from : relation.to;
      (next.get(key) ?? next.set(key, []).get(key)!).push(relation);
    }
    const visited = new Set<string>([seed]);
    const queue: { id: string; depth: number }[] = [{ id: seed, depth: 0 }];
    while (queue.length) {
      this.cancellation?.throwIfCancelled();
      const { id, depth } = queue.shift()!;
      for (const relation of next.get(id) ?? []) {
        const otherId = side === "down" ? relation.to : relation.from;
        const element = byId.get(otherId);
        if (!element || otherId === seed) continue;
        // Bookkeeping at the anchor's own span (its alias, its call) repeats the anchor.
        if (sameSpan(element.location.span, seedSpan) && !TERMINAL_KINDS.has(element.kind) && !element.originRoles.length) {
          this.alias.set(otherId, seed);
          if (!visited.has(otherId)) {
            visited.add(otherId);
            queue.push({ id: otherId, depth });
          }
          continue;
        }
        let kind = classify(relation, element);
        let status = relation.status;
        let reason: string | null = null;
        let note: string | null = null;
        if (kind !== "origin" && kind !== "terminal" && CROSS_CALL.has(relation.kind)) {
          const { sites, name } = callSitesOfElement(this.tier1, this.sites, element);
          if (!singleCall(sites)) {
            kind = "boundary";
            status = "partial";
            reason = "unproven-handoff";
            note = describeSites(name, sites);
          }
        }
        // A cross-call with many call sites is the one boundary this walk adds (R7).
        // The engine's own boundaries (external code, framework runtime) keep
        // their kind, and the slice's relations decide whether anything continues.
        const crossCallStop = reason === "unproven-handoff";
        if (kind === "boundary" && !reason) {
          reason = element.boundary ?? "external-code";
          note = element.boundary === "framework-runtime" ? `${element.label} is framework runtime; what it carries is proven only as far as the engine's relations go` : `${element.label} is outside the program's own source`;
        }
        this.addElement(element, kind, side, status, reason, note);
        this.addEdge(relation, element);
        // A terminal ends a forward path and an origin a backward one; the other way round they are carriers.
        const ends = crossCallStop || (side === "down" && kind === "terminal") || (side === "up" && kind === "origin");
        if (!ends && !visited.has(otherId) && depth < DEFAULT_BOUNDARY_POLICY.maxDepth) {
          visited.add(otherId);
          queue.push({ id: otherId, depth: depth + 1 });
        }
      }
    }
  }

  /**
   * Every gap the slice reported becomes a frontier box at its location, hung
   * off the element it stopped at. "Disconnected" is the natural end of a
   * path (nothing continues from a render slot), not a gap in the proof.
   */
  private gaps(gaps: readonly EvidenceGap[], side: Side) {
    for (const gap of gaps) {
      const id = `frontier:${gap.id}`;
      if (this.nodes.has(id) || gap.reason === "disconnected") continue;
      const from = gap.from ? this.resolve(gap.from) : null;
      const to = gap.to ? this.resolve(gap.to) : null;
      const attached = (from ? this.nodes.get(from) : undefined) ?? (to ? this.nodes.get(to) : undefined) ?? null;
      const at = gap.location ?? attached;
      if (!at) continue;
      const { file, span } = at;
      this.addNode({
        id,
        kind: "frontier",
        label: clip(gap.label, 80),
        detail: gap.reason,
        parent: this.scopeFor(file, span, side),
        file,
        line: span.startLine,
        span,
        status: gap.status,
        side,
        elementKind: null,
        typeText: null,
        reason: gap.reason,
        note: gap.label,
      });
      const source = from && this.nodes.has(from) ? from : side === "up" && to && this.nodes.has(to) ? id : null;
      const target = source === id ? to! : id;
      if (source) this.pushEdge({ id: `gap:${gap.id}`, source, target, kind: "gap", status: gap.status, proof: gap.proof, label: null });
    }
  }

  private resolve(id: string): string {
    return this.alias.get(id) ?? id;
  }

  private addElement(element: ProgramElement, kind: AnchorNode["kind"], side: Side, status: AnchorNode["status"], reason: string | null, note: string | null) {
    const existing = this.nodes.get(element.id);
    if (existing) {
      if (existing.side !== side && existing.side !== "seed") existing.side = "both";
      return;
    }
    const sourceFile = this.tier1.program.getSourceFile(path.resolve(this.root, element.location.file));
    const node = sourceFile ? nodeAtSpan(this.tier1.ts, sourceFile, element.location.span) : null;
    this.addNode({
      id: element.id,
      kind,
      label: clip(element.label),
      detail: kindWords(element.kind),
      parent: this.scopeFor(element.location.file, element.location.span, side),
      file: element.location.file,
      line: element.location.line,
      span: element.location.span,
      status,
      side,
      elementKind: element.kind,
      typeText: node ? this.typeTextOf(node) : null,
      reason,
      note,
    });
    if (element.originRoles.length) this.originRoles.set(element.id, [...element.originRoles]);
    if (kind === "terminal") this.terminalRoles.set(element.id, element.terminalRoles.length ? [...element.terminalRoles] : [element.kind]);
  }

  private addEdge(relation: ProgramRelation, element: ProgramElement) {
    const source = this.resolve(relation.from);
    const target = this.resolve(relation.to);
    if (source === target) return;
    const label = /^(field-input|pack-field|consumer-value|field-consumer)$/.test(relation.kind) && element.fieldName ? element.fieldName : null;
    this.pushEdge({ id: relation.id, source, target, kind: relation.kind, status: relation.status, proof: [relation.proof], label });
  }

  private pushEdge(edge: AnchorEdge) {
    const key = `${edge.kind}|${edge.source}|${edge.target}`;
    if (this.edgeKeys.has(key) || !this.nodes.has(edge.source) || !this.nodes.has(edge.target)) return;
    this.edgeKeys.add(key);
    this.edges.push(edge);
  }

  private addNode(node: Omit<AnchorNode, "absPath">) {
    this.nodes.set(node.id, { ...node, absPath: path.resolve(this.root, node.file) });
  }

  /** The frame an element sits in: its enclosing function (the module when there is none), one box per function and file. */
  private scopeFor(file: string, span: Span, side: Side | "seed"): string {
    const sourceFile = this.tier1.program.getSourceFile(path.resolve(this.root, file));
    const { ts } = this.tier1;
    const node = sourceFile ? nodeAtSpan(ts, sourceFile, span) : null;
    const fn = node ? enclosingFunction(ts, node) : null;
    const fnSpan = fn && sourceFile ? spanOf(sourceFile, fn) : null;
    const id = fnSpan ? `scope:${file}:${fnSpan.startLine}:${fnSpan.startColumn}` : `scope:${file}`;
    const existing = this.nodes.get(id);
    if (existing) {
      if (side !== "seed" && existing.side !== side && existing.side !== "seed") existing.side = "both";
      return id;
    }
    const name = fn && sourceFile ? functionName(ts, fn, sourceFile) : null;
    this.addNode({
      id,
      kind: "scope",
      label: name ?? (fn ? `(anonymous) in ${path.basename(file)}` : path.basename(file)),
      detail: fn ? path.basename(file) : "module",
      parent: null,
      file,
      line: fnSpan?.startLine ?? 1,
      span: fnSpan ?? { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      status: "proven",
      side,
      elementKind: null,
      typeText: null,
      reason: null,
      note: null,
    });
    return id;
  }

  private typeTextOf(node: TypeScript.Node): string | null {
    try {
      const text = this.checker.typeToString(this.checker.getTypeAtLocation(node));
      return text.length > 160 ? `${text.slice(0, 159)}…` : text;
    } catch {
      return null;
    }
  }

  private finish(anchor: AnchorGraphResult["anchor"], direction: AnchorDirection, outcome: AnchorGraphResult["outcome"], reason: string | null, coverage: AnchorGraphResult["coverage"]): AnchorGraphResult {
    const nodes = [...this.nodes.values()];
    const boxes = nodes.filter((node) => node.kind !== "scope");
    const count = (kind: AnchorNode["kind"]) => boxes.filter((node) => node.kind === kind).length;
    return anchorGraphResultSchema.parse({
      outcome,
      generation: this.tier1.generation.id,
      programHash: this.tier1.generation.programHash,
      tsconfig: this.tier1.generation.tsconfig,
      typescript: this.tier1.generation.typescript,
      reason,
      anchor,
      direction,
      nodes,
      edges: this.edges,
      origins: boxes.filter((node) => node.kind === "origin").map((node) => ({ nodeId: node.id, label: node.label, roles: this.originRoles.get(node.id) ?? [], status: node.status })),
      terminals: boxes.filter((node) => node.kind === "terminal").map((node) => ({ nodeId: node.id, label: node.label, roles: this.terminalRoles.get(node.id) ?? [], status: node.status })),
      counts: {
        up: boxes.filter((node) => node.side === "up" || node.side === "both").length,
        down: boxes.filter((node) => node.side === "down" || node.side === "both").length,
        scopes: nodes.length - boxes.length,
        origins: count("origin"),
        terminals: count("terminal"),
        boundaries: count("boundary"),
        frontiers: count("frontier"),
      },
      coverage,
    });
  }
}

function classify(relation: ProgramRelation, element: ProgramElement): AnchorNode["kind"] {
  if (element.originRoles.length) return "origin";
  if (element.terminalRoles.length || TERMINAL_KINDS.has(element.kind)) return "terminal";
  if (element.boundary) return "boundary";
  if (relation.kind === "show-when" || CONTROL_KINDS.has(element.kind)) return "control";
  if (/^(map|filter|find|pack|includes|join)/.test(relation.kind) || TRANSFORM_KINDS.has(element.kind)) return "transform";
  return "value";
}

const KIND_WORDS: Record<string, string> = {
  "field-read": "field read",
  "index-read": "index read",
  "call-result": "call result",
  "jsx-occurrence": "JSX occurrence",
  "component-occurrence": "handed to a component",
  "component-prop-binding": "prop binding",
  "field-consumer": "field consumer",
  "collection-element": "collection element",
  "predicate-result": "predicate",
  "return-expression": "return",
  "for-binding": "For item",
  "show-binding": "Show value",
  "dom-terminal": "DOM attribute",
  "render-terminal": "render slot",
  "resource-input": "resource",
  "resource-result": "resource result",
  "fetch-input": "fetch",
  "file-input": "file read",
  "environment-input": "environment",
  "process-input": "process input",
  "network-request": "network request",
  "external-read": "external read",
  "http-response": "HTTP response",
  "object-pack": "object",
  "type-narrow": "type guard",
  "function-entry": "function",
  "component-definition": "component",
};

function kindWords(kind: string): string {
  return KIND_WORDS[kind] ?? kind.replaceAll("-", " ");
}

const SYNTAX_WORDS: Record<string, string> = {
  PropertyAccessExpression: "property read",
  Identifier: "name",
  CallExpression: "call",
  BinaryExpression: "fallback",
  ConditionalExpression: "conditional",
  NonNullExpression: "assertion",
  ParenthesizedExpression: "group",
  JsxExpression: "JSX expression",
  ElementAccessExpression: "index read",
};

function syntaxWords(kind: string): string {
  return SYNTAX_WORDS[kind] ?? kind;
}

function clip(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
