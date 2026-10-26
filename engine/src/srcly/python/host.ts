// The language host over the Python helper's output: candidates from its
// expression table, types from mypy (or the annotation, said so), scopes and
// call sites from its function index.
import fs from "node:fs";
import path from "node:path";
import type { ProgramElement } from "../../analysis/scope-seam";
import type { HostCandidate, LanguageHost } from "../host";
import { EngineError } from "../protocol";
import { sameSpan, type Span } from "../selection";
import { spanKey, toSpan, type WireExpression } from "./facts";
import type { PythonTier1 } from "./session";

export function createPythonHost(tier1: PythonTier1): LanguageHost {
  const { facts, root } = tier1;
  const files = new Set(facts.files);
  const parseGaps = new Map(facts.fileGaps.map((gap) => [gap.file, gap.message]));
  /** A def's or class's name entry: a declaration, never a selectable expression of its own. */
  const isDefinition = (entry: WireExpression) => entry.k === "FunctionDef" || entry.k === "ClassDef";
  const expressions = new Map<string, { list: WireExpression[]; bySpan: Map<string, WireExpression> }>();
  const texts = new Map<string, string[]>();
  const tableFor = (file: string) => {
    let table = expressions.get(file);
    if (!table) {
      const list = facts.expressions[file] ?? [];
      table = { list, bySpan: new Map(list.map((entry) => [spanKey(toSpan(entry.s)), entry])) };
      expressions.set(file, table);
    }
    return table;
  };
  const linesOf = (file: string) => {
    let lines = texts.get(file);
    if (!lines) {
      try {
        lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
      } catch {
        lines = [];
      }
      texts.set(file, lines);
    }
    return lines;
  };
  const scopeFor = (file: string, span: Span) => {
    let best: { s: number[]; name: string; id: string } | null = null;
    for (const scope of facts.scopes[file] ?? []) {
      if (!covers(toSpan(scope.s as [number, number, number, number]), span)) continue;
      if (!best || covers(toSpan(best.s as [number, number, number, number]), toSpan(scope.s as [number, number, number, number]))) best = scope;
    }
    return best;
  };
  return {
    language: "python",
    // The provider records no `argument` relations and leaves stores and conditions unrelated:
    // a callee with several call sites stays a boundary on the way in, and a `disconnected` gap is where its evidence ends.
    evidence: { pairsCalls: false, deadEnds: false },
    file(file) {
      if (typeof file !== "string" || !file) throw new EngineError("invalid-request", "params.file is required");
      const absolute = path.resolve(root, file);
      const relative = path.relative(root, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new EngineError("invalid-request", `${file} is outside the engine root`);
      const normalized = relative.split(path.sep).join("/");
      if (!files.has(normalized)) throw new EngineError("not-found", `${normalized} is not in the Python program`);
      return { relative: normalized, absolute };
    },
    candidates(file, span, text) {
      const caret = span.startLine === span.endLine && span.startColumn === span.endColumn;
      const found = tableFor(file).list
        .filter((entry) => !isDefinition(entry) && contains(toSpan(entry.s), span, caret))
        .sort((left, right) => size(left.s) - size(right.s));
      const seen = new Set<string>();
      const out: HostCandidate[] = [];
      for (const entry of found) {
        const entrySpan = toSpan(entry.s);
        const key = spanKey(entrySpan);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: entry.k, text: entry.t, span: entrySpan });
      }
      // A parameter's text includes its annotation; selecting its name selects it.
      const names = new Map(found.map((entry) => [spanKey(toSpan(entry.s)), entry.k === "arg" ? entry.n : undefined]));
      return text && text.trim() ? out.filter((candidate) => candidate.text === text.trim() || names.get(spanKey(candidate.span)) === text.trim()) : out;
    },
    parts(file, span) {
      return tableFor(file).list
        .filter((entry) => !isDefinition(entry) && covers(span, toSpan(entry.s)) && spanKey(toSpan(entry.s)) !== spanKey(span))
        .sort((left, right) => left.s[2] - right.s[2] || left.s[3] - right.s[3] || size(left.s) - size(right.s))
        .map((entry) => ({ kind: entry.k, text: entry.t, span: toSpan(entry.s) }));
    },
    identifierOnLine(file, name, line) {
      const hits = tableFor(file).list.filter((entry) => entry.s[0] === line && (entry.n ?? (entry.k === "Name" ? entry.t : undefined)) === name);
      const hit = hits.find((entry) => entry.d) ?? hits[0];
      // A file the helper could not parse has no expressions: say so, rather than that the name is missing.
      if (!hit && parseGaps.has(file)) throw new EngineError("not-found", `No ${name} on line ${line} of ${path.basename(file)}: the file did not parse (${parseGaps.get(file)})`);
      if (!hit) return null;
      return { kind: hit.k, text: name, span: toSpan(hit.s), fallbacks: (hit.f ?? []).map(toSpan) };
    },
    textAt(file, span) {
      const entry = tableFor(file).bySpan.get(spanKey(span));
      if (entry) return entry.t;
      const lines = linesOf(file);
      if (span.startLine - 1 >= lines.length) return null;
      if (span.startLine === span.endLine) return lines[span.startLine - 1].slice(span.startColumn - 1, span.endColumn - 1);
      const parts = [lines[span.startLine - 1].slice(span.startColumn - 1), ...lines.slice(span.startLine, span.endLine - 1), (lines[span.endLine - 1] ?? "").slice(0, span.endColumn - 1)];
      return parts.join("\n");
    },
    typeTextAt(file, span) {
      const entry = tableFor(file).bySpan.get(spanKey(span));
      if (entry?.ty) return entry.ty;
      const fact = tier1.provider().facts.fileCandidates(file).find((item) => sameSpan(item.location.span, span) && typeof item.attributes.typeText === "string");
      return fact ? String(fact.attributes.typeText) : null;
    },
    scopeAt(file, span) {
      const scope = scopeFor(file, span);
      return scope ? { span: toSpan(scope.s as [number, number, number, number]), name: scope.name } : null;
    },
    callSitesOf(element: ProgramElement) {
      const callee = element.attributes?.callee;
      const entry = typeof callee === "string" && callee.startsWith("py:function-entry:") ? callee : scopeFor(element.location.file, element.location.span)?.id;
      if (!entry) return { sites: null, name: element.label };
      const sites = facts.callSites[entry];
      const name = sites?.name ?? (typeof element.attributes?.calleeName === "string" ? element.attributes.calleeName : element.label);
      return { sites: sites ? { calls: sites.calls, escapes: sites.escapes } : { calls: [], escapes: false }, name };
    },
  };
}

function before(a: { line: number; column: number }, b: { line: number; column: number }) {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

/** `outer` covers `inner` (equal spans included). */
function covers(outer: Span, inner: Span) {
  return before({ line: outer.startLine, column: outer.startColumn }, { line: inner.startLine, column: inner.startColumn })
    && before({ line: inner.endLine, column: inner.endColumn }, { line: outer.endLine, column: outer.endColumn });
}

/** An expression contains a selection; a caret at its very end does not count, as in TypeScript's `candidatesAt`. */
function contains(entry: Span, selection: Span, caret: boolean) {
  if (!covers(entry, selection)) return false;
  return !caret || !(entry.endLine === selection.startLine && entry.endColumn === selection.startColumn);
}

function size(s: number[]) {
  return (s[2] - s[0]) * 100_000 + (s[3] - s[1]);
}
