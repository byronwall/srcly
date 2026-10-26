import path from "node:path";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { queryEvidenceSlice, type EvidenceSlice } from "../../analysis/evidence-slice";
import { toSliceElement, toSliceRelation } from "../../analysis/evidence-slice-normalization";
import { DEFAULT_BOUNDARY_POLICY, scopePolicy, type EvidenceGap, type ProgramElement, type ProgramRelation } from "../../analysis/scope-seam";
import { describeSites, singleCall } from "../call-sites";
import { anchorGraphResultSchema, type AnchorDirection, type AnchorEdge, type AnchorGraphResult, type AnchorNode } from "../contracts/anchor-graph";
import { DECLARATION_KINDS, elementsAt, endsInPlace, externalCallee, naturalEnd, needsOneCallSite, pairedInSlice, SEED_KINDS, seedFor, TERMINAL_KINDS } from "../facts";
import type { HostCandidate, LanguageHost } from "../host";
import { clip, foldedLimit } from "../frontier-words";
import { ownFacts } from "../own-facts";
import { EngineError } from "../protocol";
import { parseSpan, sameSpan, type Span } from "../selection";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/** Anchor graphs bigger than this are refused as `budget-exhausted`, never truncated. */
export const ANCHOR_GRAPH_MAX_BYTES = 8 * 1024 * 1024;
/** Structural relations: they place elements, they do not move values. */
const SKIP_RELATIONS = new Set(["contains", "declares-parameter", "definition", "invokes"]);
/** Element kinds that branch or narrow a value rather than carry it. */
const CONTROL_KINDS = new Set(["type-narrow", "show-binding", "for-binding", "predicate-result"]);
/** Element kinds that reshape a value. */
const TRANSFORM_KINDS = new Set(["selection", "object-pack", "parse", "serialization", "validation", "call-result"]);
const DIRECTIONS: AnchorDirection[] = ["forward", "backward", "both"];

type Side = "up" | "down";
/** A host candidate (with the declaration spans to try when the engine has no evidence at the name itself); or an element named outright (T20). */
type Resolved = HostCandidate & { seedId?: string };
/** Declaration-level elements a symbol anchor may start from, before the ledger's seed kinds. */
const DECLARATION_SEEDS = ["component-definition", "function-entry", "handler-entry", ...SEED_KINDS];
/** Relations that point a use (a call, an occurrence) at its definition. */
const USE_RELATIONS = new Set(["definition", "invokes", "function-call", "component-occurrence"]);
/** One slice to walk: from which element, on which side of the anchor, with the span its own bookkeeping folds into. */
type Run = {
  seedId: string;
  seedSpan: Span;
  side: Side;
  /** A parameter whose reads are the real runs: its own walk decides nothing once a read exists. */
  placeholderFor?: string[];
  /** A use that is itself where the value ends (a component rendered here): drawn, never sliced, landed where it starts. */
  endsHere?: boolean;
  /** A read of the declaration's parameter: it lands only over its own drawn path, never through the shared parameter. */
  propRead?: boolean;
};
/** Relations that bind a declaration's parameter to the places it is read. */
const PARAMETER_READS = new Set(["references", "field-input"]);
/** The declaration anchor's own links: they place its parameters, reads, returns and uses, and never carry a run's landing. */
const DECLARATION_LINKS = new Set(["parameter", "prop-read", "returns", "used-by"]);

export function anchorGraphOp(session: EngineSession, params: Record<string, unknown>, cancellation?: AnalysisCancellationToken): AnchorGraphResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const direction = parseDirection(params.direction);
  const { relative } = tier1.host.file(params.file);
  const candidate = resolveCandidate(tier1, relative, params);
  const result = new AnchorGraphBuilder(tier1, cancellation).build(relative, candidate, direction);
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
function resolveCandidate(tier1: Tier1, file: string, params: Record<string, unknown>): Resolved {
  const { host } = tier1;
  // A drawn box added as an anchor (T20): the element itself, so the two traces share ids by construction.
  if (typeof params.elementId === "string" && params.elementId) {
    const element = tier1.provider().facts.getElement(params.elementId);
    if (!element) throw new EngineError("not-found", `No program element ${params.elementId}`);
    return { kind: element.kind, text: element.label, span: element.location.span, seedId: element.id };
  }
  if (typeof params.name === "string" && params.name) {
    if (!Number.isInteger(params.line) || (params.line as number) < 1) throw new EngineError("invalid-request", "params.name needs params.line");
    const found = host.identifierOnLine(file, params.name, params.line as number);
    if (!found) throw new EngineError("not-found", `No ${params.name} on line ${params.line} of ${path.basename(file)}`);
    return found;
  }
  const span = parseSpan(params.span);
  const text = typeof params.text === "string" ? params.text : null;
  const candidates = host.candidates(file, span, text);
  const candidate = candidates.find((item) => sameSpan(item.span, span)) ?? candidates[0];
  if (!candidate) throw new EngineError("unsupported-selection", "No supported expression at this selection; pick a candidate from selectExpression", { span });
  return candidate;
}

class AnchorGraphBuilder {
  private readonly nodes = new Map<string, AnchorNode>();
  private readonly edges: AnchorEdge[] = [];
  private readonly edgeKeys = new Set<string>();
  /** Bookkeeping elements at the anchor's own span stand for the anchor. */
  private readonly alias = new Map<string, string>();
  private readonly originRoles = new Map<string, string[]>();
  private readonly terminalRoles = new Map<string, string[]>();
  /** The anchor itself: a walk from one of its parameters, returns or uses never draws it again as a step. */
  private anchorId: string | null = null;
  private readonly root: string;
  private readonly host: LanguageHost;

  constructor(private readonly tier1: Tier1, private readonly cancellation?: AnalysisCancellationToken) {
    this.root = tier1.root;
    this.host = tier1.host;
  }

  build(file: string, candidate: Resolved, direction: AnchorDirection): AnchorGraphResult {
    let span = candidate.span;
    let seed = candidate.seedId ?? seedFor(this.tier1, file, span);
    // A symbol by name: when nothing sits on the name, the declaration's initializer or the function itself is the anchor.
    for (const altSpan of candidate.fallbacks ?? []) {
      if (seed) break;
      const facts = elementsAt(this.tier1, file, altSpan);
      const match = DECLARATION_SEEDS.map((kind) => facts.find((fact) => fact.kind === kind)).find(Boolean) ?? facts[0];
      if (match) {
        seed = match.id;
        span = altSpan;
      }
    }
    const fact = seed ? elementsAt(this.tier1, file, span).find((item) => item.id === seed) : undefined;
    const anchorId = seed ?? `anchor:${file}:${span.startLine}:${span.startColumn}`;
    this.anchorId = anchorId;
    const anchor = {
      file,
      absPath: path.resolve(this.root, file),
      span,
      text: clip(candidate.text),
      kind: candidate.kind,
      elementId: seed,
      typeText: this.host.typeTextAt(file, candidate.span),
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
    const runs: Run[] = fact && DECLARATION_KINDS.has(fact.kind) ? this.declarationRuns(file, span, seed, sides, fact.kind === "component-definition") : sides.map((side) => ({ seedId: seed, seedSpan: span, side }));
    const isDeclaration = fact !== undefined && DECLARATION_KINDS.has(fact.kind);
    const gapsBySeed = new Map<string, number>();
    const naturalBySeed = new Map<string, number>();
    for (const run of runs) {
      if (run.endsHere) continue;
      const slice = this.slice(run, anchor.text);
      this.walk(run.seedId, slice, run.side, run.seedSpan);
      const natural = this.gaps(slice.gaps, run.side, new Map(slice.elements.map((element) => [element.id, element])));
      naturalBySeed.set(run.seedId, (naturalBySeed.get(run.seedId) ?? 0) + natural);
      coverage.elements += slice.elements.length;
      coverage.relations += slice.relations.length;
      coverage.budget.used += slice.relations.length;
      coverage.budget.limit += DEFAULT_BOUNDARY_POLICY.maxRelations;
      // Any limit the slice hit leaves the walk short of the budget's story, not only the relation budget.
      const cut = slice.coverage.truncation;
      coverage.budget.exhausted ||= cut.budget || cut.elements || cut.relations || cut.depth;
      gapsBySeed.set(run.seedId, (gapsBySeed.get(run.seedId) ?? 0) + slice.gaps.length);
    }
    const landedRuns = runs
      .filter((run) => !(run.placeholderFor && run.placeholderFor.length > 0))
      .map((run) => {
        // A prop read's slice walks back through the whole props object, so a natural start it finds may be another prop's.
        const landed = this.runLanded(run, gapsBySeed.get(run.seedId) ?? 0, run.propRead ? 0 : naturalBySeed.get(run.seedId) ?? 0);
        if (run.propRead && landed !== true) this.unboundRead(run.seedId);
        return run.propRead ? landed === true : landed;
      })
      .filter((value): value is boolean => value !== null);
    const naturalStarts = [...naturalBySeed.values()].reduce((sum, count) => sum + count, 0) + this.literalStarts();
    const drawn = [...this.nodes.values()];
    const kinds = drawn.map((node) => node.kind);
    // A frontier, or a boundary the walk could not pass, leaves the proof partial; a framework boundary passed on proven relations does not.
    const stopped = drawn.some((node) => node.kind === "frontier" || (node.kind === "boundary" && node.status !== "proven"));
    // Landed: a terminal forward or an origin backward. A declaration anchor
    // lands only when every one of its runs landed: its parameter, return
    // and use links are structural, found by syntax, so they prove nothing
    // on their own.
    // Backward, a path that starts at a literal, a constant or an external import has landed too (R16).
    const landed = isDeclaration
      ? runs.length > 0 && landedRuns.every(Boolean)
      : (sides.includes("down") && kinds.includes("terminal")) || (sides.includes("up") && (kinds.includes("origin") || naturalStarts > 0));
    const outcome = stopped ? "partial" : landed ? "ok" : coverage.budget.exhausted ? "budget" : "partial";
    return this.finish(anchor, direction, outcome, null, coverage);
  }

  /**
   * Whether one run reached its end: a terminal for a down run, an origin
   * for an up run, reachable from its seed over the drawn edges (runs share
   * boxes, so a path that merges into another run's boxes still lands). A
   * use that is itself a terminal kind (a component occurrence) has landed
   * where it starts. A run that reached nothing and reported no gap is
   * null: the engine made no claim either way, so it neither lands nor
   * stops the declaration's outcome.
   */
  private runLanded(run: Run, gaps: number, naturalStarts: number): boolean | null {
    const want: AnchorNode["kind"] = run.side === "down" ? "terminal" : "origin";
    const seedNode = this.nodes.get(run.seedId);
    if (run.side === "down" && seedNode?.elementKind && TERMINAL_KINDS.has(seedNode.elementKind)) return true;
    if (run.side === "up" && naturalStarts > 0) return true;
    const lands = (id: string) => {
      const node = this.nodes.get(id);
      return node?.kind === want || (run.side === "up" && node?.elementKind === "literal");
    };
    const next = new Map<string, string[]>();
    for (const edge of this.edges) {
      if (edge.status === "structural" || DECLARATION_LINKS.has(edge.kind)) continue;
      const [from, to] = run.side === "down" ? [edge.source, edge.target] : [edge.target, edge.source];
      (next.get(from) ?? next.set(from, []).get(from)!).push(to);
    }
    const seen = new Set<string>([run.seedId]);
    const queue = [run.seedId];
    let reached = 0;
    while (queue.length) {
      for (const id of next.get(queue.shift()!) ?? []) {
        if (seen.has(id) || id === this.anchorId) continue;
        seen.add(id);
        reached += 1;
        if (lands(id)) return true;
        queue.push(id);
      }
    }
    return reached > 0 || gaps > 0 ? false : null;
  }

  /**
   * A prop read no caller's binding reaches: the engine relates no binding
   * to it (a read inside a nested function, a spread), so where its value
   * comes from is not traced. A frontier named by the read says so, and the
   * declaration's outcome stays partial.
   */
  private unboundRead(readId: string) {
    const read = this.nodes.get(readId);
    if (!read) return;
    const id = `frontier:unbound:${readId}`;
    this.addNode({
      id,
      kind: "frontier",
      label: read.label,
      detail: "unbound-read",
      parent: read.parent,
      file: read.file,
      line: read.line,
      span: read.span,
      status: "partial",
      side: "up",
      elementKind: read.elementKind,
      typeText: null,
      reason: "unbound-read",
      note: `No caller's binding is related to this read of ${read.label}, so where its value comes from is not traced.`,
    });
    this.pushEdge({ id: `gap:unbound:${readId}`, source: id, target: readId, kind: "gap", status: "partial", proof: [], label: null });
  }

  /** Literal boxes drawn on the up side: a value that begins at `"x"` has come from somewhere (R16). */
  private literalStarts(): number {
    let count = 0;
    for (const node of this.nodes.values()) if (node.elementKind === "literal" && (node.side === "up" || node.side === "both")) count += 1;
    return count;
  }

  private slice(run: Run, label: string): EvidenceSlice {
    const dir = run.side === "down" ? "forward" : "backward";
    return queryEvidenceSlice(this.tier1.provider(), {
      seed: { candidateId: `anchor:${run.seedId}:${dir}`, entryElementId: run.seedId, adapter: "anchor-graph", label, framework: null, proof: [], defaults: scopePolicy({ direction: dir }) },
      direction: dir,
      ...(dir === "forward" ? { terminalPolicy: { roles: ["render", "component-occurrence", "side-effect", "return"] } } : {}),
      cancellation: this.cancellation,
    });
  }

  /**
   * A function or component anchored by name has no value of its own. What
   * comes in is what reaches its parameters; where it goes is what its
   * returns reach, and the places it is called or rendered. Each becomes a
   * box joined to the anchor and a slice of its own. The parameter and
   * return links are found by syntax, so they are `structural`: they place
   * the boxes and prove nothing. The reads of a parameter come from the
   * engine's own relations (`references`, then `field-input`), each edge
   * keeping that relation's status and proof; where no relation exists there
   * is no edge, and nothing is guessed from the source text.
   */
  private declarationRuns(file: string, span: Span, seed: string, sides: Side[], perProp: boolean): Run[] {
    const inside = (s: Span) =>
      (s.startLine > span.startLine || (s.startLine === span.startLine && s.startColumn >= span.startColumn)) &&
      (s.endLine < span.endLine || (s.endLine === span.endLine && s.endColumn <= span.endColumn)) &&
      !(s.startLine === span.startLine && s.startColumn === span.startColumn && s.endLine === span.endLine && s.endColumn === span.endColumn);
    const provider = this.tier1.provider();
    const facts = ownFacts(this.host, file, span, provider.facts.fileCandidates(file).filter((fact) => inside(fact.location.span)));
    const runs: Run[] = [];
    if (sides.includes("up")) {
      for (const param of facts.filter((fact) => fact.kind === "parameter")) {
        this.addFact(param, "up");
        this.pushEdge({ id: `parameter:${param.id}`, source: param.id, target: seed, kind: "parameter", status: "structural", proof: [], label: null });
        const paramRun: Run = { seedId: param.id, seedSpan: param.location.span, side: "up", placeholderFor: [] };
        runs.push(paramRun);
        // What a caller binds arrives where the parameter is read: `props.viewer`,
        // or `viewer` itself when the parameter is destructured. Follow the
        // engine's relations from the parameter to its first field reads.
        const seen = new Set<string>([param.id]);
        const queue = [param.id];
        while (queue.length) {
          const fromId = queue.shift()!;
          for (const raw of provider.getRelations(fromId, "forward", this.cancellation)) {
            if (!PARAMETER_READS.has(raw.kind) || seen.has(raw.to)) continue;
            seen.add(raw.to);
            const element = provider.facts.getElement(raw.to);
            if (!element) continue;
            if (element.kind === "field-read") {
              const relation = toSliceRelation(raw);
              this.addFact(element, "up");
              this.pushEdge({ id: `prop:${relation.id}`, source: element.id, target: param.id, kind: "prop-read", status: relation.status, proof: [relation.proof], label: element.label });
              // A component's caller binds each prop (`<C a={x}>`), so each read must land; a function's binds the whole argument.
              if (!perProp) continue;
              runs.push({ seedId: element.id, seedSpan: element.location.span, side: "up", propRead: true });
              paramRun.placeholderFor!.push(element.id);
            } else if (raw.kind === "references") {
              // The parameter's own value at a use site: its field reads hang off it.
              queue.push(element.id);
            }
          }
        }
      }
    }
    if (sides.includes("down")) {
      const expressions = facts.filter((fact) => fact.kind === "return-expression");
      for (const ret of expressions.length ? expressions : facts.filter((fact) => fact.kind === "return")) {
        // A return that leaves the program (an HTTP response, an entry's result) is a terminal, not a carrier.
        const raw = this.tier1.provider().factIndex.getElement(ret.id);
        const element = raw ? toSliceElement(raw) : null;
        if (element?.terminalRoles.length) this.addElement(element, "terminal", "down", "proven", null, null);
        else this.addFact(ret, "down");
        this.pushEdge({ id: `returns:${ret.id}`, source: seed, target: ret.id, kind: "returns", status: "structural", proof: [], label: null });
        runs.push({ seedId: ret.id, seedSpan: ret.location.span, side: "down" });
      }
      // Where it is used: the calls and occurrences whose definition this is.
      const uses = this.slice({ seedId: seed, seedSpan: span, side: "up" }, seed);
      const byId = new Map(uses.elements.map((element) => [element.id, element]));
      for (const relation of uses.relations) {
        if (relation.to !== seed || !USE_RELATIONS.has(relation.kind)) continue;
        const use = byId.get(relation.from);
        if (!use || this.nodes.has(use.id)) continue;
        this.addElement(use, "value", "down", relation.status, null, use.kind === "component-occurrence" || use.kind === "jsx-occurrence" ? "rendered here" : "called here");
        this.pushEdge({ id: `use:${relation.id}`, source: seed, target: use.id, kind: "used-by", status: relation.status, proof: [relation.proof], label: null });
        // A component rendered here is where the value ends: its body is the anchor's own, already traced.
        runs.push({ seedId: use.id, seedSpan: use.location.span, side: "down", ...(TERMINAL_KINDS.has(use.kind) ? { endsHere: true } : {}) });
      }
    }
    return runs;
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
        if (!element || otherId === seed || otherId === this.anchorId) continue;
        // Bookkeeping at the anchor's own span (its alias, its call) repeats the anchor.
        if (sameSpan(element.location.span, seedSpan) && !TERMINAL_KINDS.has(element.kind) && !element.originRoles.length) {
          this.alias.set(otherId, seed);
          if (!visited.has(otherId)) {
            visited.add(otherId);
            queue.push({ id: otherId, depth });
          }
          continue;
        }
        // A plain read of a name (the Python provider marks it) repeats its binding: walk through, draw nothing.
        if (element.attributes?.transparent === true && !element.originRoles.length && !element.terminalRoles.length) {
          if (!this.alias.has(otherId)) this.alias.set(otherId, this.resolve(id));
          if (!visited.has(otherId)) {
            visited.add(otherId);
            queue.push({ id: otherId, depth });
          }
          continue;
        }
        let kind = classify(relation, element, side);
        // A return the slice carried on from (to its paired call) is a carrier here, not where the value leaves.
        if (kind === "terminal" && element.kind === "return" && side === "down" && (next.get(element.id) ?? []).some((item) => item.kind === "return-value")) kind = "value";
        let status = relation.status;
        let reason: string | null = null;
        let note: string | null = null;
        if (kind !== "origin" && kind !== "terminal" && needsOneCallSite(relation.kind, this.host.evidence.pairsCalls)) {
          // The callee side of a cross-call is its `to` end (the bound parameter, or the call a return reaches), whichever way the walk goes.
          const { sites, name } = this.host.callSitesOf(byId.get(relation.to) ?? element);
          if (!singleCall(sites) && !pairedInSlice(sites, slice.elements)) {
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
        // `classify` gives each side only its own end: a terminal forward, an origin backward.
        const ends = crossCallStop || kind === "terminal" || kind === "origin";
        if (!ends && !visited.has(otherId) && depth < DEFAULT_BOUNDARY_POLICY.maxDepth) {
          visited.add(otherId);
          queue.push({ id: otherId, depth: depth + 1 });
        }
      }
    }
  }

  /**
   * Every gap the slice reported becomes a frontier box at its location, hung
   * off the element it stopped at. A `disconnected` gap (no indexed relation
   * continues) is a natural start (a literal, a constant, an external import
   * or global: no box, R16), a value the code ends in place (a branch test, a
   * write: its box becomes the terminal it lands at), or a dead end: a
   * frontier that leaves the outcome partial. A seed missing from the index
   * stays `unsupported`. A frontier is named by where it stopped (the element,
   * the external callee); the reason is its detail and the sentence its note.
   * One element limit's gaps fold into one frontier that names how many.
   */
  private gaps(gaps: readonly EvidenceGap[], side: Side, elements: Map<string, ProgramElement>): number {
    let naturalStarts = 0;
    const labelOf = (id: string | null | undefined) => (id ? (elements.get(id) ?? this.tier1.provider().facts.getElement(id))?.label : undefined);
    const limited = gaps.filter((gap) => gap.reason === "budget-exhausted" && /^Element limit/.test(gap.label));
    const folded = new Set(limited.slice(1).map((gap) => gap.id));
    for (const gap of gaps) {
      const id = `frontier:${gap.id}`;
      if (this.nodes.has(id) || folded.has(gap.id)) continue;
      let [label, note, reason, status]: [string, string, string, EvidenceGap["status"]] = [clip(gap.label, 80), gap.label, gap.reason, gap.status];
      let elementKind: string | null = null;
      if (limited[0] === gap) ({ label, note } = foldedLimit(limited, labelOf, DEFAULT_BOUNDARY_POLICY.maxElements));
      else if (gap.reason === "disconnected") {
        const element = gap.from ? elements.get(gap.from) ?? this.tier1.provider().facts.getElement(gap.from) : undefined;
        if (!gap.location || !element) {
          reason = "no-evidence-element";
          status = "unsupported";
        } else if (naturalEnd(this.tier1, element)) {
          if (side === "up" && naturalEnd(this.tier1, element) === "start") naturalStarts += 1;
          const consumed = side === "down" && naturalEnd(this.tier1, element) === "consumed" ? endsInPlace(this.tier1, element) : null, box = this.nodes.get(this.resolve(element.id));
          if (consumed && box && ["value", "transform", "control"].includes(box.kind)) this.terminalRoles.set(Object.assign(box, { kind: "terminal", note: `ends here · ${consumed === "branch" ? "decides a branch" : "written, not read"}` }).id, [consumed]);
          continue;
        } else {
          const callee = externalCallee(this.tier1, element);
          label = clip(callee ?? element.label);
          note = callee ? `${callee} is outside the program's own source` : side === "down" ? "dead end · nothing continues from here" : "dead end · nothing reaches here";
          reason = callee ? "external-code" : "disconnected";
          status = "partial";
          elementKind = element.kind;
        }
      }
      const from = gap.from ? this.resolve(gap.from) : null;
      const to = gap.to ? this.resolve(gap.to) : null;
      const attached = (from ? this.nodes.get(from) : undefined) ?? (to ? this.nodes.get(to) : undefined) ?? null;
      const at = gap.location ?? attached;
      if (!at) continue;
      const { file, span } = at;
      this.addNode({
        id,
        kind: "frontier",
        label,
        detail: reason,
        parent: this.scopeFor(file, span, side),
        file,
        line: span.startLine,
        span,
        status,
        side,
        elementKind,
        typeText: null,
        reason,
        note,
      });
      const source = from && this.nodes.has(from) ? from : side === "up" && to && this.nodes.has(to) ? id : null;
      const target = source === id ? to! : id;
      if (source) this.pushEdge({ id: `gap:${gap.id}`, source, target, kind: "gap", status, proof: gap.proof, label: null });
    }
    return naturalStarts;
  }

  /** A declaration's own parameter or return as a plain value box (the file index knows it without roles or proof). */
  private addFact(fact: { id: string; kind: string; label: string; location: { file: string; line: number; span: Span } }, side: Side) {
    if (this.nodes.has(fact.id)) return;
    this.addNode({
      id: fact.id,
      kind: "value",
      label: clip(fact.label),
      detail: kindWords(fact.kind),
      parent: this.scopeFor(fact.location.file, fact.location.span, side),
      file: fact.location.file,
      line: fact.location.line,
      span: fact.location.span,
      status: "proven",
      side,
      elementKind: fact.kind,
      typeText: this.host.typeTextAt(fact.location.file, fact.location.span),
      reason: null,
      note: null,
    });
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
      typeText: this.host.typeTextAt(element.location.file, element.location.span) ?? typeAttribute(element),
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
    // One edge per pair of boxes: the first relation the walk meets names it.
    const key = `${edge.source}|${edge.target}`;
    if (this.edgeKeys.has(key) || !this.nodes.has(edge.source) || !this.nodes.has(edge.target)) return;
    this.edgeKeys.add(key);
    this.edges.push(edge);
  }

  private addNode(node: Omit<AnchorNode, "absPath">) {
    this.nodes.set(node.id, { ...node, absPath: path.resolve(this.root, node.file) });
  }

  /** The frame an element sits in: its enclosing function (the module when there is none), one box per function and file. */
  private scopeFor(file: string, span: Span, side: Side | "seed"): string {
    const scope = this.host.scopeAt(file, span);
    const fnSpan = scope?.span ?? null;
    const id = fnSpan ? `scope:${file}:${fnSpan.startLine}:${fnSpan.startColumn}` : `scope:${file}`;
    const existing = this.nodes.get(id);
    if (existing) {
      if (side !== "seed" && existing.side !== side && existing.side !== "seed") existing.side = "both";
      return id;
    }
    this.addNode({
      id,
      kind: "scope",
      label: scope?.name ?? (scope ? `(anonymous) in ${path.basename(file)}` : path.basename(file)),
      detail: scope ? path.basename(file) : "module",
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

/** A type the evidence carries itself (the Python provider records the checker's or the annotation's). */
function typeAttribute(element: ProgramElement): string | null {
  const value = element.attributes?.typeText;
  return typeof value === "string" ? value : null;
}

/**
 * A box's role on the side it sits on. Where a value starts is an origin
 * only upstream, and where it ends a terminal only downstream: the other way
 * round the same element is a carrier (upstream, a callee's `return` is where
 * the value comes from), so it takes whatever role it has besides.
 */
function classify(relation: ProgramRelation, element: ProgramElement, side: Side): AnchorNode["kind"] {
  if (side === "up" && element.originRoles.length) return "origin";
  if (side === "down" && (element.terminalRoles.length || TERMINAL_KINDS.has(element.kind))) return "terminal";
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
  // Python's ast node names.
  Attribute: "attribute read",
  Name: "name",
  Call: "call",
  Subscript: "index read",
  BoolOp: "fallback",
  IfExp: "conditional",
  Await: "await",
  arg: "parameter",
  FunctionDef: "function",
  AsyncFunctionDef: "function", ClassDef: "class",
};

function syntaxWords(kind: string): string {
  return SYNTAX_WORDS[kind] ?? kind;
}

