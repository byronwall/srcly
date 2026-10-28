import path from "node:path";
import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { queryEvidenceSlice, type EvidenceSlice } from "../../analysis/evidence-slice";
import { toSliceElement, toSliceRelation } from "../../analysis/evidence-slice-normalization";
import { scopePolicy, type EvidenceGap, type ProgramElement, type ProgramRelation } from "../../analysis/scope-seam";
import { ANCHOR_LIMITS, assumedThrough, foldAnnotatedUses, performs, undrawn, usesOf, walkFollows } from "../anchor-slice";
import { describeSites, singleCall } from "../call-sites";
import { anchorGraphResultSchema, type AnchorDirection, type AnchorEdge, type AnchorGraphResult, type AnchorNode } from "../contracts/anchor-graph";
import { elementsAt, endsInPlace, externalCallee, standardLibraryCall, IN_PLACE_NOTES, isNaturalStart, naturalEnd, needsOneCallSite, pairedInSlice, seedFor } from "../facts";
import { elementTraits, proofStrength, relationTraits, SEED_KINDS } from "../kinds";
import type { LanguageHost } from "../host";
import { clip, foldedLimit } from "../frontier-words";
import { kindWords, syntaxWords, useWords } from "../anchor-words";
import { ownFacts } from "../own-facts";
import { resolveCandidate, type Resolved } from "./anchor-candidate";
import { EngineError } from "../protocol";
import { sameSpan, type Span } from "../selection";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";

/** Anchor graphs bigger than this are refused as `budget-exhausted`, never truncated. */
export const ANCHOR_GRAPH_MAX_BYTES = 8 * 1024 * 1024;
const DIRECTIONS: AnchorDirection[] = ["forward", "backward", "both"];

type Side = "up" | "down";
/** Declaration-level elements a symbol anchor may start from, before the ledger's seed kinds. */
const DECLARATION_SEEDS = ["component-definition", "function-entry", "handler-entry", ...SEED_KINDS];
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
  /** A call of the declaration, walked from where it is used. */
  use?: boolean;
  /** A parameter walked forward through the body: it lands at the declaration's own return too, whose run goes on from there. */
  body?: boolean;
};
/** Relations that bind a declaration's parameter to the places it is read. */
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
  /** A declaration anchor's own returns: where a body run hands on to the return's run. */
  private readonly ownReturns = new Set<string>();
  /** Each run's `unrecorded` ends (`naturalEnd`): named only when that run lands nowhere else. */
  private readonly quietGaps = new Map<string, number>();
  private readonly named = new Set<string>();
  private readonly stops = new Set<string>(); // side:box:reason of each stop drawn
  private readonly quiet = new Map<string, { gap: EvidenceGap; element: { label: string; kind: string }; side: Side }[]>();
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
    const runs: Run[] = fact && elementTraits(fact.kind).declaration ? this.declarationRuns(file, span, seed, sides, fact.kind === "component-definition", /class/i.test(candidate.kind)) : sides.map((side) => ({ seedId: seed, seedSpan: span, side }));
    const isDeclaration = fact !== undefined && Boolean(elementTraits(fact.kind).declaration);
    const gapsBySeed = new Map<string, number>();
    const naturalBySeed = new Map<string, number>();
    for (const run of runs) {
      if (run.endsHere) continue;
      const slice = this.slice(run, anchor.text);
      this.walk(run.seedId, slice, run.side, run.seedSpan);
      const natural = this.gaps(slice.gaps, run.side, new Map(slice.elements.map((element) => [element.id, element])), run.seedId);
      naturalBySeed.set(run.seedId, (naturalBySeed.get(run.seedId) ?? 0) + natural);
      coverage.elements += slice.elements.length;
      coverage.relations += slice.relations.length;
      coverage.budget.used += slice.relations.length;
      coverage.budget.limit += ANCHOR_LIMITS.maxRelations;
      // Any limit the slice hit leaves the walk short of the budget's story, not only the relation budget.
      const cut = slice.coverage.truncation;
      coverage.budget.exhausted ||= cut.budget || cut.elements || cut.relations || cut.depth;
      gapsBySeed.set(run.seedId, (gapsBySeed.get(run.seedId) ?? 0) + slice.gaps.length - (this.quietGaps.get(run.seedId) ?? 0));
      this.quietGaps.delete(run.seedId);
    }
    coverage.budget.exhausted ||= this.nodes.has(`frontier:uses:${seed}`);
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
    // A declaration whose runs reached nothing and reported nothing makes no claim: there is nothing to trace from it.
    if (!stopped && isDeclaration && landedRuns.length === 0) return this.finish(anchor, direction, "unsupported", "nothing-to-trace", coverage);
    // `ok` is proven: a path that lands only by assuming what code with no source does (an `external-call` proof) is partial.
    const assumed = this.edges.some((edge) => edge.proof.some((item) => proofStrength(item?.kind) === "assumed"));
    const outcome = stopped ? "partial" : landed && !assumed ? "ok" : landed || !coverage.budget.exhausted ? "partial" : "budget";
    // Every partial names its stop: where a run that did not land ends in evidence that cannot call it a dead end.
    // A declaration whose every run landed, partial only because a step assumes what library code does, has no stop to name: its assumed edges say so.
    if (outcome === "partial" && !stopped && !(isDeclaration && landed && assumed)) {
      const unlanded = runs.filter((run) => !run.endsHere && this.runLanded(run, gapsBySeed.get(run.seedId) ?? 0, naturalBySeed.get(run.seedId) ?? 0) !== true);
      for (const run of unlanded) for (const end of this.quiet.get(run.seedId) ?? []) this.untraced(end.gap, end.element, end.side);
      // Paths that only loop back, or end where nothing names an end: the run's own start is where the trace stops.
      if (this.named.size === 0) {
        for (const run of unlanded) {
          const node = this.nodes.get(this.resolve(run.seedId));
          if (!node || node.id === this.anchorId) continue;
          const location = { file: node.file, line: node.line, column: node.span.startColumn, span: node.span };
          this.untraced({ id: `end:${node.id}`, from: node.id, to: null, label: node.label, reason: "disconnected", status: "partial", location, proof: [] }, { label: node.label, kind: node.elementKind ?? node.kind }, run.side, "not traced to an end · no path from here reaches an end the engine can name");
        }
      }
    }
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
    if (run.side === "down" && seedNode?.elementKind && elementTraits(seedNode.elementKind).terminal) return true;
    if (run.side === "up" && naturalStarts > 0) return true;
    const next = new Map<string, string[]>();
    for (const edge of this.edges) {
      if (edge.status === "structural" || DECLARATION_LINKS.has(edge.kind)) continue;
      const [from, to] = run.side === "down" ? [edge.source, edge.target] : [edge.target, edge.source];
      (next.get(from) ?? next.set(from, []).get(from)!).push(to);
    }
    // A prop read's own path (its binding, not the whole props object) lands where a value naturally begins: a global or external import, or a value code outside the program makes (R16).
    const element = (id: string) => (run.propRead && !next.has(id) ? this.tier1.provider().facts.getElement(id) : undefined);
    const begins = (id: string, found = element(id)) => !!found && (isNaturalStart(this.tier1, found) || !!externalCallee(this.tier1, found));
    const lands = (id: string) => this.nodes.get(id)?.kind === want || (run.body === true && this.ownReturns.has(id)) || (run.side === "up" && (this.nodes.get(id)?.elementKind === "literal" || begins(id)));
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

  /** A declaration's uses past `maxWalkedUses`: drawn where they are, not walked; one frontier off the anchor names how many. */
  private unwalkedUses(seed: string, labels: string[]) {
    const anchor = this.nodes.get(seed)!;
    const id = `frontier:uses:${seed}`;
    const note = `The walk follows ${ANCHOR_LIMITS.maxWalkedUses} of its uses; it did not follow ${clip(labels.slice(0, 6).join(", "), 120)}${labels.length > 6 ? ", …" : ""}.`;
    this.addNode({ ...anchor, id, kind: "frontier", label: `${labels.length} uses not followed`, detail: "budget-exhausted", status: "partial", side: "down", elementKind: null, typeText: null, reason: "budget-exhausted", note });
    this.pushEdge({ id: `gap:uses:${seed}`, source: seed, target: id, kind: "gap", status: "partial", proof: [], label: null });
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
      boundaryPolicy: { maxDepth: ANCHOR_LIMITS.maxDepth, maxElements: ANCHOR_LIMITS.maxElements, maxRelations: ANCHOR_LIMITS.maxRelations },
      terminalPolicy: { maxTerminals: ANCHOR_LIMITS.maxTerminals, ...(dir === "forward" ? { roles: ["render", "component-occurrence", "side-effect", "return"] } : {}) },
      follow: walkFollows(run.seedId, dir === "forward"),
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
  private declarationRuns(file: string, span: Span, seed: string, sides: Side[], perProp: boolean, isClass: boolean): Run[] {
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
            if (!relationTraits(raw.kind).parameterRead || seen.has(raw.to)) continue;
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
      // A function's body: each parameter walked forward reaches its writes, calls, returns and stops. A
      // component's props reach its render slots through its uses, a class's fields are where it is built,
      // and a method's receiver (`self`) is what it is called on.
      for (const param of perProp || isClass ? [] : facts.filter((fact) => fact.kind === "parameter" && fact.attributes?.receiver !== true)) {
        // Both ways, the parameter is already drawn on the left with its link in.
        if (!this.nodes.has(param.id)) {
          this.addFact(param, "down");
          this.pushEdge({ id: `parameter:${param.id}`, source: seed, target: param.id, kind: "parameter", status: "structural", proof: [], label: null });
        }
        runs.push({ seedId: param.id, seedSpan: param.location.span, side: "down", body: true });
      }
      const expressions = facts.filter((fact) => fact.kind === "return-expression");
      for (const ret of expressions.length ? expressions : facts.filter((fact) => fact.kind === "return")) {
        // A return that leaves the program (an HTTP response, an entry's result) is a terminal, not a carrier.
        const raw = this.tier1.provider().factIndex.getElement(ret.id);
        const element = raw ? toSliceElement(raw) : null;
        if (element?.terminalRoles.length) this.addElement(element, "terminal", "down", "proven", null, null);
        else this.addFact(ret, "down");
        this.pushEdge({ id: `returns:${ret.id}`, source: seed, target: ret.id, kind: "returns", status: "structural", proof: [], label: null });
        this.ownReturns.add(ret.id);
        runs.push({ seedId: ret.id, seedSpan: ret.location.span, side: "down" });
      }
      // Where it is used: the calls and occurrences whose definition this is.
      // A hub (a helper called everywhere) walks its first uses; the rest are drawn, not walked, and one frontier says how many.
      const unwalked: string[] = [];
      const folds = foldAnnotatedUses((id, more) => this.nodes.has(id) && (this.nodes.get(id)!.note = `${useWords("parameter")}, and ${more} more in this file`));
      for (const { relation, use } of usesOf(provider, seed, this.cancellation)) {
        if (this.nodes.has(use.id) || folds(use)) continue;
        // A use that is itself where a value leaves (a return typed with the class) is drawn as that terminal.
        this.addElement(use, use.terminalRoles.length ? "terminal" : "value", "down", relation.status, null, useWords(use.kind));
        this.pushEdge({ id: `use:${relation.id}`, source: seed, target: use.id, kind: "used-by", status: relation.status, proof: [relation.proof], label: null });
        // A component rendered here is where the value ends: its body is the anchor's own, already traced.
        const endsHere = Boolean(elementTraits(use.kind).terminal);
        if (!endsHere && runs.filter((run) => run.use).length >= ANCHOR_LIMITS.maxWalkedUses) unwalked.push(use.label);
        else runs.push({ seedId: use.id, seedSpan: use.location.span, side: "down", ...(endsHere ? { endsHere } : { use: true }) });
      }
      if (unwalked.length) this.unwalkedUses(seed, unwalked);
    }
    return runs;
  }

  /** Breadth first from the seed over the slice's relations, one side at a time; terminals, origins and boundaries end a path. */
  private walk(seed: string, slice: EvidenceSlice, side: Side, seedSpan: Span) {
    const byId = new Map(slice.elements.map((element) => [element.id, element]));
    const next = new Map<string, ProgramRelation[]>();
    for (const relation of slice.relations) {
      if (undrawn(relation.kind)) continue;
      const key = side === "down" ? relation.from : relation.to;
      (next.get(key) ?? next.set(key, []).get(key)!).push(relation);
    }
    const visited = new Set<string>([seed]);
    const queue: { id: string; depth: number }[] = [{ id: seed, depth: 0 }];
    /** Elements the walk expanded, and those it went on from. */
    const popped: string[] = [];
    const continued = new Set<string>();
    while (queue.length) {
      this.cancellation?.throwIfCancelled();
      const { id, depth } = queue.shift()!;
      popped.push(id);
      for (const relation of next.get(id) ?? []) {
        const otherId = side === "down" ? relation.to : relation.from;
        const element = byId.get(otherId);
        if (!element || otherId === seed || otherId === this.anchorId) continue;
        continued.add(id);
        // Bookkeeping at the anchor's own span (its alias, its call) repeats the anchor.
        if (sameSpan(element.location.span, seedSpan) && !elementTraits(element.kind).terminal && !element.originRoles.length) {
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
        if (kind === "terminal" && element.kind === "return" && side === "down" && (next.get(element.id) ?? []).some((item) => item.kind === "return-value" || item.kind === "framework-flow")) kind = "value";
        let status = relation.status;
        let reason: string | null = null;
        let note: string | null = null;
        // A plain return of a function no call names, only handed on as a value (a callback), goes to whoever calls it: not where the value leaves.
        const handedOn = kind === "terminal" && element.kind === "return" && side === "down" && element.terminalRoles.every((role) => role === "return") ? this.host.callSitesOf(element) : null;
        if (handedOn?.sites?.escapes && !handedOn.sites.calls.length) [kind, status, reason, note] = ["boundary", "partial", "unproven-handoff", describeSites(handedOn.name, handedOn.sites)];
        if (!reason && kind !== "origin" && kind !== "terminal" && needsOneCallSite(relation.kind, this.host.evidence.pairsCalls)) {
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
        if (!ends && !visited.has(otherId) && depth < ANCHOR_LIMITS.maxDepth) {
          visited.add(otherId);
          queue.push({ id: otherId, depth: depth + 1 });
        }
      }
    }
    this.walkEnds(seed, side, popped.filter((id) => !continued.has(id)), byId);
  }

  /**
   * Boxes this run drew that nothing continues from on its side, though the
   * slice reported no gap there (a call whose only onward relation names its
   * definition, a value only a condition reads): quiet ends, named like the
   * slice's own `unrecorded` ends when the run lands nowhere.
   */
  private walkEnds(seed: string, side: Side, ends: string[], byId: Map<string, ProgramElement>) {
    for (const id of ends) {
      const box = this.resolve(id);
      const node = this.nodes.get(box);
      const element = byId.get(id);
      // A value that naturally begins here (a literal, an external import or global) is where a backward run lands, not a quiet end.
      if (!node || !element || box === this.anchorId || !["value", "transform", "control"].includes(node.kind) || (side === "up" && (isNaturalStart(this.tier1, element) || externalCallee(this.tier1, element)))) continue;
      // A value the code ends in place (a branch test) has landed there, as at a slice gap.
      const consumed = side === "down" ? endsInPlace(this.tier1, element) : null;
      if (consumed) {
        this.terminalRoles.set(Object.assign(node, { kind: "terminal", note: IN_PLACE_NOTES[consumed] }).id, [consumed]);
        continue;
      }
      const gap: EvidenceGap = { id: `end:${box}`, from: box, to: null, label: node.label, reason: "disconnected", status: "partial", location: element.location, proof: [] };
      const callee = side === "down" && performs(this.tier1.provider(), element.id) ? externalCallee(this.tier1, element) : null; // A classified library call (`xs.map(…)`) still ends outside the program.
      if (callee) this.frontier(gap, side, { label: clip(callee), note: `${callee} is outside the program's own source`, reason: "external-code", status: "partial", elementKind: element.kind });
      else (this.quiet.get(seed) ?? this.quiet.set(seed, []).get(seed)!).push({ gap, element: { label: node.label, kind: element.kind }, side });
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
   * A slice's size-limit gaps (its element, depth and work limits) fold into one frontier that names how many.
   */
  private gaps(gaps: readonly EvidenceGap[], side: Side, elements: Map<string, ProgramElement>, seedId: string): number {
    let naturalStarts = 0;
    const labelOf = (id: string | null | undefined) => (id ? (elements.get(id) ?? this.tier1.provider().facts.getElement(id))?.label : undefined);
    const limited = gaps.filter((gap) => gap.reason === "budget-exhausted");
    const folded = new Set(limited.slice(1).map((gap) => gap.id));
    for (const gap of gaps) {
      const id = `frontier:${gap.id}`;
      if (this.nodes.has(id) || folded.has(gap.id)) continue;
      let [label, note, reason, status]: [string, string, string, EvidenceGap["status"]] = [clip(gap.label, 80), gap.label, gap.reason, gap.status];
      let elementKind: string | null = null;
      if (limited[0] === gap) ({ label, note } = foldedLimit(limited, labelOf, ANCHOR_LIMITS));
      else if (gap.reason === "disconnected") {
        const element = gap.from ? elements.get(gap.from) ?? this.tier1.provider().facts.getElement(gap.from) : undefined;
        if (!gap.location || !element) {
          reason = "no-evidence-element";
          status = "unsupported";
        } else if (side === "up" && externalCallee(this.tier1, element)) {
          // Upstream, a value made by code outside the program (`time.time()`, `uuid4()`) begins there, as an external import does.
          naturalStarts += 1;
          continue;
        } else if (naturalEnd(this.tier1, element)) {
          const end = naturalEnd(this.tier1, element);
          if (side === "up" && end === "start") naturalStarts += 1;
          const consumed = side === "down" && end === "consumed" ? endsInPlace(this.tier1, element) : null, box = this.nodes.get(this.resolve(element.id));
          if (consumed && box && ["value", "transform", "control"].includes(box.kind)) this.terminalRoles.set(Object.assign(box, { kind: "terminal", note: IN_PLACE_NOTES[consumed] }).id, [consumed]);
          if (end === "unrecorded") (this.quiet.get(seedId) ?? this.quiet.set(seedId, []).get(seedId)!).push({ gap, element, side });
          // Reaching a declaration or a terminal claims nothing about the run: it is not one of the run's gaps.
          if (end === "bookkeeping") this.quietGaps.set(seedId, (this.quietGaps.get(seedId) ?? 0) + 1);
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
      this.frontier(gap, side, { label, note, reason, status, elementKind });
    }
    return naturalStarts;
  }

  /**
   * Where a run that landed nowhere ends in evidence that cannot tell a dead
   * end from the end of what it records (a Python store, a condition, a
   * parameter nothing in the program passes): a frontier named by the
   * element, so the partial says where it stops.
   */
  private untraced(gap: EvidenceGap, element: { label: string; kind: string }, side: Side, said?: string) {
    // One stop per box, whichever way its end was found.
    const box = gap.from ? this.resolve(gap.from) : gap.id;
    if (this.named.has(box)) return;
    this.named.add(box);
    const note = said ?? (side === "down" ? "not traced further · the evidence records nothing that continues from here" : "not traced further · nothing the evidence records reaches here");
    this.frontier(gap, side, { label: clip(element.label), note, reason: "untraced", status: "partial", elementKind: element.kind });
  }

  /** One frontier box at a gap, hung off the element it stopped at. */
  private frontier(gap: EvidenceGap, side: Side, words: { label: string; note: string; reason: string; status: AnchorNode["status"]; elementKind: string | null }) {
    const id = `frontier:${gap.id}`;
    const from = gap.from ? this.resolve(gap.from) : null;
    // One stop per box, side and reason, however it was found (a slice gap, a walk's own end): a key already in leaves the set's size unchanged.
    if (this.nodes.has(id) || this.stops.size === this.stops.add(`${side}:${from ?? id}:${words.reason}`).size) return;
    const to = gap.to ? this.resolve(gap.to) : null;
    const attached = (from ? this.nodes.get(from) : undefined) ?? (to ? this.nodes.get(to) : undefined) ?? null;
    const at = gap.location ?? attached;
    if (!at) return;
    const { file, span } = at;
    const { label, note, reason, status, elementKind } = words;
    this.addNode({ id, kind: "frontier", label, detail: reason, parent: this.scopeFor(file, span, side), file, line: span.startLine, span, status, side, elementKind, typeText: null, reason, note });
    const source = from && this.nodes.has(from) ? from : side === "up" && to && this.nodes.has(to) ? id : null;
    const target = source === id ? to! : id;
    if (source) this.pushEdge({ id: `gap:${gap.id}`, source, target, kind: "gap", status, proof: gap.proof, label: null });
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
    const callee = assumedThrough(this.tier1.provider(), relation);
    if (!callee) return this.pushEdge({ id: relation.id, source, target, kind: relation.kind, status: relation.status, proof: [relation.proof], label });
    // TypeScript's own library (`trim`, `map`, `JSON.stringify`, `console.log`) is known: its value derives from what it is given, modelled.
    const call = this.tier1.provider().factIndex.getElement(relation.to);
    const standard = Boolean(call && standardLibraryCall(this.tier1, call));
    const what = relation.kind === "argument" ? "argument" : "receiver";
    const assumed = standard
      ? { kind: "standard-library", detail: `${clip(callee, 80)} is the standard library: its value derives from this ${what}.`, locations: relation.proof.locations, status: "proven" as const }
      : { kind: "external-call", detail: `Assumed: ${clip(callee, 80)} has no source to read, so its value is taken to derive from this ${what}.`, locations: relation.proof.locations, status: "partial" as const };
    this.pushEdge({ id: relation.id, source, target, kind: relation.kind, status: standard ? relation.status : "partial", proof: [relation.proof, assumed], label });
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
  if (side === "down" && (element.terminalRoles.length || elementTraits(element.kind).terminal)) return "terminal";
  if (element.boundary) return "boundary";
  const roles = [relationTraits(relation.kind).role, elementTraits(element.kind).role];
  if (roles.includes("control")) return "control";
  if (roles.includes("transform")) return "transform";
  return "value";
}
