// The pure half of `survey-gate.ts`: summarize a survey, list what moved
// between two summaries, render the move tables, and read a PR body's
// acknowledgement. Kept apart so the tests can import it without running a survey.

export type Trace = { file: string; name: string; outcome: string; ms: number; code?: string; message?: string; stops?: { kind: string; reason: string | null }[] };
export type RepoSummary = { traces: number; outcomes: Record<string, number>; stops: Record<string, number>; ok: string[]; errors: string[] };
export type Summaries = Record<string, RepoSummary>;

/** The acknowledgement a PR body carries when the gate reports moves. */
export const ACK_LINE = "Survey moves:";

export function summarize(traces: Trace[]): RepoSummary {
  const outcomes: Record<string, number> = {};
  const stops: Record<string, number> = {};
  for (const trace of traces) {
    outcomes[trace.outcome] = (outcomes[trace.outcome] ?? 0) + 1;
    for (const stop of trace.stops ?? []) {
      const key = `${stop.kind}: ${stop.reason ?? "-"}`;
      stops[key] = (stops[key] ?? 0) + 1;
    }
  }
  return {
    traces: traces.length,
    outcomes: sorted(outcomes),
    stops: sorted(stops),
    ok: traces.filter((trace) => trace.outcome === "ok").map(traceId).sort(),
    errors: traces.filter((trace) => trace.outcome === "error").map((trace) => `${traceId(trace)}: ${trace.code}`).sort(),
  };
}

export function traceId(trace: Trace): string {
  return `${trace.file}#${trace.name}`;
}

/**
 * Every difference between two summaries as one line each, in deltas rather
 * than before/after values, so two runs against different bases that move the
 * same things list the same lines (the post-merge check compares them).
 */
export function moves(base: Summaries, head: Summaries): string[] {
  const lines: string[] = [];
  for (const name of union(base, head)) {
    const a = base[name];
    const b = head[name];
    if (!a || !b) {
      lines.push(`${name}: ${a ? "missing from the head survey" : "missing from the base survey"}`);
      continue;
    }
    if (a.traces !== b.traces) lines.push(`${name}: traces ${signed(b.traces - a.traces)}`);
    for (const key of union(a.outcomes, b.outcomes)) if (a.outcomes[key] !== b.outcomes[key]) lines.push(`${name}: outcome ${key} ${signed((b.outcomes[key] ?? 0) - (a.outcomes[key] ?? 0))}`);
    for (const key of union(a.stops, b.stops)) if (a.stops[key] !== b.stops[key]) lines.push(`${name}: stop ${key} ${signed((b.stops[key] ?? 0) - (a.stops[key] ?? 0))}`);
    lines.push(...listMoves(name, a.ok, b.ok, "now ok", "no longer ok"));
    lines.push(...listMoves(name, a.errors, b.errors, "now errors", "no longer errors"));
  }
  return lines;
}

/** A trace that errors in the head and did not in the base. Always fails, acknowledged or not. */
export function newErrors(base: Summaries, head: Summaries): string[] {
  return union(base, head).flatMap((name) => listMoves(name, base[name]?.errors ?? [], head[name]?.errors ?? [], "now errors", null));
}

/** Markdown: outcomes for every repo, then the stops and traces that moved. */
export function table(base: Summaries, head: Summaries): string[] {
  const names = union(base, head);
  const keys = new Set([...Object.values(base), ...Object.values(head)].flatMap((repo) => Object.keys(repo.outcomes)));
  const order = ["ok", "partial", "assumed", "error"];
  const columns = [...order.filter((key) => keys.has(key)), ...[...keys].filter((key) => !order.includes(key)).sort()];
  const cell = (a: number | undefined, b: number | undefined) => (a === b ? `${b ?? 0}` : `${a ?? 0} → ${b ?? 0}`);
  type Pick = (repo: RepoSummary) => number | undefined;
  /** One repo's value, or the total over every repo when `name` is null. */
  const at = (repos: Summaries, name: string | null, pick: Pick) =>
    name === null ? Object.values(repos).reduce((n, repo) => n + (pick(repo) ?? 0), 0) : repos[name] ? pick(repos[name]) : undefined;
  const row = (label: string, name: string | null) => {
    const picks: Pick[] = [(repo) => repo.traces, ...columns.map((key): Pick => (repo) => repo.outcomes[key])];
    return `| ${label} | ${picks.map((pick) => cell(at(base, name, pick), at(head, name, pick))).join(" | ")} |`;
  };
  const lines = [`| Repo | Traces | ${columns.join(" | ")} |`, `| --- | ---: | ${columns.map(() => "---:").join(" | ")} |`];
  for (const name of names) lines.push(row(name, name));
  lines.push(row("**all**", null));

  const stops: string[] = [];
  for (const name of names) {
    const a = base[name]?.stops ?? {};
    const b = head[name]?.stops ?? {};
    for (const key of union(a, b)) if (a[key] !== b[key]) stops.push(`| ${name} | ${key} | ${a[key] ?? 0} | ${b[key] ?? 0} | ${signed((b[key] ?? 0) - (a[key] ?? 0))} |`);
  }
  lines.push("", stops.length ? ["| Repo | Stop | Base | Head | Δ |", "| --- | --- | ---: | ---: | ---: |", ...stops].join("\n") : "Stops: no change.");

  const traces = names
    .filter((name) => base[name] && head[name])
    .flatMap((name) => [...listMoves(name, base[name].ok, head[name].ok, "now ok", "no longer ok"), ...listMoves(name, base[name].errors, head[name].errors, "now errors", "no longer errors")]);
  if (traces.length) lines.push("", ...traces.map((line) => `- ${line}`));
  return lines;
}

/**
 * True when the PR body has a `Survey moves:` line (a heading, bold or list
 * item counts) with some explanation after it, on that line or below.
 */
export function acknowledged(body: string): boolean {
  const match = /^[\s>#*_-]*survey moves[*_\s]*:/im.exec(body);
  return !!match && /\w/.test(body.slice(match.index + match[0].length));
}

/** The lines in one list and not the other: what the post-merge check reports when main moved differently from the PR. */
export function difference(expected: string[], actual: string[]): { unexpected: string[]; missing: string[] } {
  const [want, got] = [new Set(expected), new Set(actual)];
  return { unexpected: actual.filter((line) => !want.has(line)), missing: expected.filter((line) => !got.has(line)) };
}

function listMoves(name: string, before: string[], after: string[], added: string, removed: string | null): string[] {
  const [a, b] = [new Set(before), new Set(after)];
  const lines = after.filter((item) => !a.has(item)).map((item) => `${name}: ${added} ${item}`);
  if (removed) lines.push(...before.filter((item) => !b.has(item)).map((item) => `${name}: ${removed} ${item}`));
  return lines;
}

function union(a: object, b: object): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

function sorted(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
