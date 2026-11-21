import type { AnalysisCancellationToken } from "../../analysis/cancellation";
import { toSliceElement } from "../../analysis/evidence-slice-normalization";
import type { ProgramElement } from "../../analysis/scope-seam";
import type { AnchorGraphResult, AnchorNode } from "../contracts/anchor-graph";
import { flowSignatureResultSchema, type FlowItem, type FlowPair, type FlowScope, type FlowSignatureResult } from "../contracts/flow-signature";
import { EngineError } from "../protocol";
import type { Span } from "../selection";
import { checkGeneration, type EngineSession, type Tier1 } from "../session";
import { anchorGraphOp } from "./anchor-graph";
import { functionEffectsOp } from "./function-effects";

/** Functions traced per file, and ends traced backward per function; what is past a cap is counted, never dropped silently. */
export const FLOW_SIGNATURE_MAX_SCOPES = 40;
export const FLOW_SIGNATURE_MAX_ENDS = 12;

type Scope = { span: Span; name: string; role: string | null; facts: ProgramElement[] };

/**
 * The flow signature of each function of `file`: of those that overlap
 * `lines` or are named in `names`, when `lines` is given (the other side of a
 * compare names the functions it traced). Nothing here traces by itself: a function's status,
 * stops and what its result reaches come from the anchor graph of its
 * declaration, each origin-to-end pair from the anchor graph walked backward
 * from an end the evidence places in the function, and its effects from
 * `functionEffects`. The signature only renames what those found into keys
 * that hold no line and no local's name.
 */
export function flowSignatureOp(session: EngineSession, params: Record<string, unknown>, cancellation?: AnalysisCancellationToken): FlowSignatureResult {
  const tier1 = session.tier1();
  checkGeneration(tier1, params.expectedGeneration);
  const { relative: file } = tier1.host.file(params.file);
  const ranges = parseLines(params.lines);
  const all = scopesOf(tier1, file, cancellation);
  const names = Array.isArray(params.names) ? new Set(params.names.filter((item): item is string => typeof item === "string")) : new Set<string>();
  const asked = ranges ? all.filter((scope) => names.has(scope.name) || ranges.some(([from, to]) => from <= scope.span.endLine && to >= scope.span.startLine)) : all;
  const seen = new Map<string, number>();
  const scopes = asked.slice(0, FLOW_SIGNATURE_MAX_SCOPES).map((scope) => {
    cancellation?.throwIfCancelled();
    const count = (seen.get(scope.name) ?? 0) + 1;
    seen.set(scope.name, count);
    return signatureOf(session, tier1, file, scope, count > 1 ? `${scope.name}#${count}` : scope.name, cancellation);
  });
  return flowSignatureResultSchema.parse({
    outcome: "ok",
    generation: tier1.generation.id,
    programHash: tier1.generation.programHash,
    tsconfig: tier1.generation.tsconfig,
    typescript: tier1.generation.typescript,
    nullProof: tier1.generation.nullProof,
    reason: null,
    file,
    language: tier1.language,
    scopes,
    skippedScopes: asked.length - scopes.length,
  });
}

function parseLines(value: unknown): [number, number][] | null {
  if (value === undefined || value === null) return null;
  const ok = Array.isArray(value) && value.every((item) => Array.isArray(item) && item.length === 2 && item.every((n) => Number.isInteger(n) && n >= 1));
  if (!ok) throw new EngineError("invalid-request", "params.lines must be a list of [startLine, endLine]");
  return value as [number, number][];
}

const encloses = (outer: Span, inner: Span) =>
  (outer.startLine < inner.startLine || (outer.startLine === inner.startLine && outer.startColumn <= inner.startColumn)) &&
  (outer.endLine > inner.endLine || (outer.endLine === inner.endLine && outer.endColumn >= inner.endColumn));
const spanKey = (span: Span) => `${span.startLine}:${span.startColumn}-${span.endLine}:${span.endColumn}`;

/** The file's named functions in source order, each with the facts it owns; a callback's facts go to the named function around it. */
function scopesOf(tier1: Tier1, file: string, cancellation?: AnalysisCancellationToken): Scope[] {
  const index = tier1.provider(true, cancellation).facts;
  const owners = new Map<string, { span: Span; name: string | null; role: string | null; facts: ProgramElement[] }>();
  for (const compact of index.fileCandidates(file)) {
    const found = index.getElement(compact.id);
    if (!found) continue;
    const element = toSliceElement(found as Parameters<typeof toSliceElement>[0]);
    const scope = tier1.host.scopeAt(file, element.location.span);
    if (!scope) continue;
    const key = spanKey(scope.span);
    let owner = owners.get(key);
    // A callback the host names by its place (`<For> child`) is not a function a review names: its facts go to the function around it.
    const name = scope.name && /^[\w$.]+$/.test(scope.name) ? scope.name : null;
    if (!owner) owners.set(key, (owner = { span: scope.span, name, role: scope.role ?? null, facts: [] }));
    owner.facts.push(element);
  }
  const named = [...owners.values()].filter((owner) => owner.name) as Scope[];
  for (const owner of owners.values()) {
    if (owner.name) continue;
    const around = named.filter((scope) => encloses(scope.span, owner.span)).sort((a, b) => (encloses(a.span, b.span) ? 1 : -1))[0];
    around?.facts.push(...owner.facts);
  }
  return named.sort((a, b) => a.span.startLine - b.span.startLine || a.span.startColumn - b.span.startColumn);
}

/** A label with no arguments and no line: `fetch(url)` is `fetch`, `database write: db.note.update(…)` is `db.note.update`. */
function nameOf(label: string): string {
  if (/^\(|=>/.test(label)) return "callback";
  // A model's own words before the call (`database write: `, `print: `) name the kind, which the key already holds.
  const text = label.replace(/^[a-z][\w -]*: /, "").replace(/^<(\w[\w.]*)[^]*$/, "<$1>");
  const cut = text.search(/[(`]/);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\s+/g, " ").trim().slice(0, 80) || label.slice(0, 80);
}

const ORIGIN_KINDS: Record<string, string> = { fetch: "network", network: "network", filesystem: "file", "external-read": "external-read" };
const END_KINDS: Record<string, string> = { "file-write": "file", "component-occurrence": "render", "http-response": "response" };

function originKind(roles: readonly string[], label: string): string {
  if (/^database /.test(label)) return "database";
  const role = roles.find((item) => item !== "input-boundary") ?? roles[0] ?? "origin";
  return ORIGIN_KINDS[role] ?? role;
}

/** An end's class: its most specific role, a database write by its label, or the boundary of a fact at the same place (a `fetch` call is a network end). */
function endKind(roles: readonly string[], label: string, boundaries: readonly (string | null)[]): string {
  if (/^database /.test(label)) return "database";
  const role = roles.find((item) => item !== "side-effect");
  if (role) return END_KINDS[role] ?? role;
  if (boundaries.includes("network")) return "network";
  if (boundaries.includes("filesystem")) return "file";
  if (boundaries.includes("process")) return "process";
  return "effect";
}

const item = (kind: string, label: string, file: string, line: number, status: string): FlowItem => ({ key: `${kind}:${label}`, kind, label, file, line, status });

function unique<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((entry) => !seen.has(entry.key) && seen.add(entry.key));
}

/** Field paths with no longer path of the same binding beside them: `props.user` goes when `props.user.email` is read. */
function leaves(items: FlowItem[]): FlowItem[] {
  return items.filter((entry) => !items.some((other) => other.label.startsWith(`${entry.label}.`)));
}

function signatureOf(session: EngineSession, tier1: Tier1, file: string, scope: Scope, name: string, cancellation?: AnalysisCancellationToken): FlowScope {
  const { span } = scope;
  const inScope = (node: Pick<AnchorNode, "file" | "line">) => node.file === file && node.line >= span.startLine && node.line <= span.endLine;
  const typescript = tier1.language === "typescript";

  // The scope's parameters, by the checker's symbol, and every field path read from them.
  const parameters = new Set<string>();
  for (const fact of scope.facts) {
    const binding = fact.kind === "parameter" ? tier1.host.bindingAt(file, fact.location.span) : null;
    if (binding) parameters.add(binding.symbol);
  }
  const readOf = (at: Span): string | null => {
    const binding = tier1.host.bindingAt(file, at);
    if (!binding || !parameters.has(binding.symbol)) return null;
    const base = binding.symbol.split("@")[0];
    return binding.field ? `${base}.${binding.field}` : base;
  };
  // A render slot is named by the parameter path it shows, else as a local value: a local's own name is not part of the key.
  const slotOf = (fact: ProgramElement): string => {
    if (fact.kind === "component-occurrence") return nameOf(fact.label);
    const binding = tier1.host.bindingAt(file, fact.location.span);
    return readOf(fact.location.span) ?? (binding || /^[\w$]+$/.test(fact.label) ? "local value" : nameOf(fact.label));
  };
  const reads = typescript
    ? leaves(unique(scope.facts.flatMap((fact) => {
        const label = fact.kind === "field-read" ? readOf(fact.location.span) : null;
        return label ? [item("parameter", label, file, fact.location.span.startLine, fact.status)] : [];
      })))
    : null;

  // The declaration's own trace: its status, its stops, and what its result reaches outside it.
  let status: FlowScope["status"] = "not-analyzed";
  let reason: string | null = null;
  const stops: FlowItem[] = [];
  const reached: FlowItem[] = [];
  const stopsOf = (graph: AnchorGraphResult) => {
    for (const node of graph.nodes) {
      // A proven boundary (the network, the framework runtime) is where a value really leaves, not a gap.
      if (node.kind !== "frontier" && !(node.kind === "boundary" && node.status !== "proven")) continue;
      const label = node.elementKind ? nameOf(node.label) : (node.reason ?? node.label);
      stops.push(item(node.reason ?? node.kind, label, node.file, node.line, node.status));
    }
  };
  try {
    const graph = anchorGraphOp(session, { file, name: scope.name.split(".").pop(), line: span.startLine, direction: "both" }, cancellation);
    status = graph.outcome;
    reason = graph.reason;
    stopsOf(graph);
    const roles = new Map(graph.terminals.map((terminal) => [terminal.nodeId, terminal.roles]));
    for (const node of graph.nodes) {
      if (node.kind !== "terminal" || inScope(node) || node.elementKind === "return") continue;
      reached.push(item(endKind(roles.get(node.id) ?? [], node.label, []), nameOf(node.label), node.file, node.line, node.status));
    }
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    reason = error.code;
    if (error.code === "budget-exhausted") status = "budget";
  }

  // Origins and ends the evidence places inside the function.
  const origins = unique(
    leaves(scope.facts.filter((fact) => fact.originRoles.length && fact.kind !== "parameter").map((fact) => item(originKind(fact.originRoles, fact.label), nameOf(fact.label), file, fact.location.span.startLine, fact.status))),
  );
  const at = new Map<string, ProgramElement[]>();
  for (const fact of scope.facts) at.set(spanKey(fact.location.span), [...(at.get(spanKey(fact.location.span)) ?? []), fact]);
  const endFacts = scope.facts.filter((fact) => {
    if (!fact.terminalRoles.length || fact.kind === "return") return false;
    // A call with a named end at the same place (`console.log` is stdout) is that end, not a second one.
    const specific = (at.get(spanKey(fact.location.span)) ?? []).some((other) => other !== fact && other.terminalRoles.some((role) => role !== "side-effect" && role !== "return"));
    return !(specific && fact.terminalRoles.every((role) => role === "side-effect"));
  });
  const ends: FlowItem[] = [];
  const pairs: FlowPair[] = [];
  for (const fact of endFacts.slice(0, FLOW_SIGNATURE_MAX_ENDS)) {
    cancellation?.throwIfCancelled();
    const beside = at.get(spanKey(fact.location.span)) ?? [];
    const kind = endKind(fact.terminalRoles, fact.label, beside.map((other) => other.boundary));
    const end = item(kind, kind === "render" ? slotOf(fact) : nameOf(fact.label), file, fact.location.span.startLine, fact.status);
    ends.push(end);
    let graph: AnchorGraphResult;
    try {
      graph = anchorGraphOp(session, { file, elementId: fact.id, direction: "backward" }, cancellation);
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      stops.push(item(error.code, end.label, file, end.line, "partial"));
      continue;
    }
    const roles = new Map(graph.origins.map((origin) => [origin.nodeId, origin.roles]));
    const found: FlowItem[] = [];
    // A parameter the engine names as an origin (a handler's request) gives its reads that class.
    const parameterKinds = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.kind === "origin" && node.elementKind === "parameter" && inScope(node)) parameterKinds.set(node.label, originKind(roles.get(node.id) ?? [], node.label));
    }
    for (const node of graph.nodes) {
      if (node.kind === "origin" && node.elementKind !== "parameter") {
        // The end's own call is not where its value comes from.
        if (node.file === file && beside.some((other) => other.location.span.startLine === node.line && other.label === node.label)) continue;
        found.push(item(originKind(roles.get(node.id) ?? [], node.label), nameOf(node.label), node.file, node.line, node.status));
      } else if (inScope(node) && node.symbol && parameters.has(node.symbol) && (node.field || node.elementKind === "parameter")) {
        const base = node.symbol.split("@")[0];
        found.push(item(parameterKinds.get(base) ?? "parameter", node.field ? `${base}.${node.field}` : base, node.file, node.line, node.status));
      } else if (!typescript && node.elementKind === "parameter" && inScope(node) && node.side === "up") {
        found.push(item(parameterKinds.get(node.label) ?? "parameter", node.label, node.file, node.line, node.status));
      }
    }
    for (const origin of leaves(unique(found))) pairs.push({ key: `${origin.key} -> ${end.key}`, origin, end, status: graph.outcome });
  }

  // What the function touches (TypeScript only): effects as facts, unresolved callees as stops.
  let effects: FlowItem[] | null = null;
  if (typescript) {
    try {
      const result = functionEffectsOp(session, { file, line: span.startLine, column: span.startColumn }, cancellation);
      if (result.outcome !== "unsupported") {
        effects = result.facts.filter((fact) => fact.family !== "promise").map((fact) => item(`${fact.family}/${fact.kind}`, nameOf(fact.label), fact.witness.file, fact.witness.line, fact.status));
        for (const frontier of result.frontiers) stops.push(item(frontier.reason, nameOf(frontier.label), frontier.witness.file, frontier.witness.line, "partial"));
      }
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
    }
  }

  return {
    name,
    role: scope.role,
    line: span.startLine,
    endLine: span.endLine,
    status,
    reason,
    origins,
    ends: unique([...ends, ...reached]),
    pairs: unique(pairs),
    reads,
    effects: effects && unique(effects),
    stops: unique(stops),
    untracedEnds: Math.max(0, endFacts.length - FLOW_SIGNATURE_MAX_ENDS),
  };
}
