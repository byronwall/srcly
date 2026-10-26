import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A data-flow coverage regression gate. Surveys a small fixed corpus that
// lives in this repo (srcly's own client and server, and one example) with
// `survey-blockers.ts`, one repo per process, and compares the outcomes with
// the committed `survey-baseline.json`. Always prints what moved.
//
// Fails when the run differs from the baseline in any way it records (trace
// counts, outcomes up or down, stops by kind, the ok and error trace lists),
// so each PR commits exactly the moves it causes, and when a trace runs past
// its time limit. The survey is deterministic: every local and CI run so far
// matched, so there is no tolerance.
//
//   pnpm survey-gate            # check
//   pnpm survey-gate --update   # rewrite the baseline (commit it with the change that moved it)

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.dirname(ENGINE);
const BASELINE = path.join(ENGINE, "survey-baseline.json");
const OUT = path.join(ENGINE, "tmp/survey-gate");

/** A repo's first trace builds the shared evidence index, so it gets its own limit. Measured in CI: see AGENTS.md. */
const FIRST_TRACE_LIMIT_MS = 30_000;
const TRACE_LIMIT_MS = 5_000;

type Corpus = { name: string; root: string; every: number; language?: "python"; needs: string };
const python = process.env.SRCLY_PYTHON ?? path.join(REPO, "server/.venv/bin/python");
const CORPUS: Corpus[] = [
  { name: "client", root: path.join(REPO, "client"), every: 6, needs: path.join(REPO, "client/node_modules") },
  { name: "value-flow-basics", root: path.join(ENGINE, "examples/value-flow-basics"), every: 1, needs: path.join(ENGINE, "node_modules") },
  { name: "server", root: path.join(REPO, "server"), every: 5, language: "python", needs: python },
];

type Trace = { file: string; name: string; outcome: string; ms: number; code?: string; message?: string; stops?: { kind: string; reason: string | null }[] };
type Survey = { tier1: { ok: boolean; code?: string; message?: string }; traces?: Trace[] };
type RepoSummary = { traces: number; outcomes: Record<string, number>; stops: Record<string, number>; ok: string[]; errors: string[] };
type Baseline = { note: string; repos: Record<string, RepoSummary> };

const update = process.argv.includes("--update");
for (const repo of CORPUS) {
  if (!fs.existsSync(repo.needs)) fail(`${repo.name} needs ${path.relative(REPO, repo.needs)}: install the client (pnpm install), the engine (pnpm install) and the server (uv sync) first.`);
}

fs.rmSync(OUT, { recursive: true, force: true });
const now: Record<string, RepoSummary> = {};
/** Always fail: a survey that crashes, a repo the engine cannot open, a trace past its limit. */
const failures: string[] = [];
/** Fail a check, not an update: what moved against the baseline. */
const regressions: string[] = [];
const timing: string[] = [];
for (const repo of CORPUS) {
  const flags = ["--root", repo.root, "--name", repo.name, "--out", OUT, "--every", String(repo.every), "--deadline", String(FIRST_TRACE_LIMIT_MS * 2)];
  if (repo.language) flags.push("--language", repo.language, "--python", python);
  const run = spawnSync(process.execPath, ["--max-old-space-size=3072", "--import", "tsx", "scripts/survey-blockers.ts", ...flags], { cwd: ENGINE, stdio: ["ignore", "inherit", "inherit"] });
  const file = path.join(OUT, `${repo.name}.json`);
  if (run.status !== 0 || !fs.existsSync(file)) {
    failures.push(`${repo.name}: the survey exited ${run.status ?? run.signal}`);
    continue;
  }
  const survey: Survey = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!survey.tier1.ok) failures.push(`${repo.name}: the engine cannot open it: ${survey.tier1.code}: ${survey.tier1.message?.split("\n")[0]}`);
  const traces = survey.traces ?? [];
  now[repo.name] = summarize(traces);
  traces.forEach((trace, index) => {
    const limit = index === 0 ? FIRST_TRACE_LIMIT_MS : TRACE_LIMIT_MS;
    if (trace.ms > limit) failures.push(`${repo.name}: ${id(trace)} took ${trace.ms} ms (limit ${limit} ms)`);
  });
  const slowest = traces.slice(1).reduce<Trace | null>((max, trace) => (!max || trace.ms > max.ms ? trace : max), null);
  timing.push(`${repo.name}: first trace ${traces[0]?.ms ?? "–"} ms, slowest after it ${slowest ? `${slowest.ms} ms (${id(slowest)})` : "–"}`);
}

const before: Baseline | null = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
const report = diff(before?.repos ?? {}, now);
report.push("", ...timing.map((line) => `- ${line}`));

const UPDATE = "run `pnpm survey-gate --update` and commit the baseline";
if (before) {
  for (const name of [...new Set([...Object.keys(before.repos), ...Object.keys(now)])]) {
    const [a, b] = [before.repos[name], now[name]];
    const moved = !a || !b ? ["the repo"] : (["traces", "outcomes", "stops", "ok", "errors"] as const).filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
    if (moved.length) regressions.push(`${name}: ${moved.join(", ")} differ from the baseline: ${UPDATE}`);
  }
} else {
  regressions.push(`no baseline: ${UPDATE}`);
}

if (update) {
  const next: Baseline = { note: "Data-flow coverage baseline for `pnpm survey-gate`. Regenerate with `pnpm survey-gate --update` in the PR that moves it.", repos: now };
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  report.push("", `Wrote ${path.relative(REPO, BASELINE)}.`);
}
const realFailures = update ? failures : [...failures, ...regressions];
if (realFailures.length) report.push("", "**Survey gate failed:**", ...realFailures.map((line) => `- ${line}`));
else report.push("", update ? "Baseline updated." : "Survey gate passed.");
const text = report.join("\n");
process.stdout.write(`\n${text}\n`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Data-flow survey gate\n\n${text}\n`);
process.exit(realFailures.length ? 1 : 0);

function summarize(traces: Trace[]): RepoSummary {
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
    ok: traces.filter((trace) => trace.outcome === "ok").map(id).sort(),
    errors: traces.filter((trace) => trace.outcome === "error").map((trace) => `${id(trace)}: ${trace.code}`).sort(),
  };
}

/** Before/after tables: outcomes for every repo, stops and ok traces only where they moved. */
function diff(old: Record<string, RepoSummary>, next: Record<string, RepoSummary>): string[] {
  const lines = ["| Repo | Traces | ok | partial | error | other |", "| --- | ---: | ---: | ---: | ---: | ---: |"];
  const names = [...new Set([...Object.keys(old), ...Object.keys(next)])];
  const cell = (a: number | undefined, b: number | undefined) => (a === b ? `${b ?? 0}` : `${a ?? 0} → ${b ?? 0}`);
  const other = (repo?: RepoSummary) => (repo ? repo.traces - (repo.outcomes.ok ?? 0) - (repo.outcomes.partial ?? 0) - (repo.outcomes.error ?? 0) : undefined);
  const total = (pick: (repo: RepoSummary) => number | undefined, repos: Record<string, RepoSummary>) => sum(Object.values(repos).map((repo) => pick(repo) ?? 0));
  for (const name of names) {
    const a = old[name];
    const b = next[name];
    lines.push(`| ${name} | ${cell(a?.traces, b?.traces)} | ${cell(a?.outcomes.ok, b?.outcomes.ok)} | ${cell(a?.outcomes.partial, b?.outcomes.partial)} | ${cell(a?.outcomes.error, b?.outcomes.error)} | ${cell(other(a), other(b))} |`);
  }
  const pickOk = (repo: RepoSummary) => repo.outcomes.ok;
  lines.push(`| **all** | ${cell(total((r) => r.traces, old), total((r) => r.traces, next))} | ${cell(total(pickOk, old), total(pickOk, next))} | ${cell(total((r) => r.outcomes.partial, old), total((r) => r.outcomes.partial, next))} | ${cell(total((r) => r.outcomes.error, old), total((r) => r.outcomes.error, next))} | ${cell(total(other, old), total(other, next))} |`);

  const moved: string[] = [];
  for (const name of names) {
    const a = old[name]?.stops ?? {};
    const b = next[name]?.stops ?? {};
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) if (a[key] !== b[key]) moved.push(`| ${name} | ${key} | ${a[key] ?? 0} | ${b[key] ?? 0} | ${signed((b[key] ?? 0) - (a[key] ?? 0))} |`);
  }
  lines.push("", moved.length ? ["| Repo | Stop | Before | After | Δ |", "| --- | --- | ---: | ---: | ---: |", ...moved].join("\n") : "Stops: no change.");

  const traces: string[] = [];
  for (const name of names.filter((repo) => old[repo] && next[repo])) {
    const a = new Set(old[name]?.ok ?? []);
    const b = new Set(next[name]?.ok ?? []);
    for (const trace of [...a].filter((t) => !b.has(t))) traces.push(`- ${name}: ${trace} is no longer ok`);
    for (const trace of [...b].filter((t) => !a.has(t))) traces.push(`- ${name}: ${trace} is now ok`);
    const [errorsBefore, errorsNow] = [new Set(old[name]?.errors ?? []), new Set(next[name]?.errors ?? [])];
    for (const trace of [...errorsNow].filter((t) => !errorsBefore.has(t))) traces.push(`- ${name}: ${trace} now errors`);
    for (const trace of [...errorsBefore].filter((t) => !errorsNow.has(t))) traces.push(`- ${name}: ${trace} no longer errors`);
  }
  if (traces.length) lines.push("", ...traces);
  return lines;
}

function id(trace: Trace): string {
  return `${trace.file}#${trace.name}`;
}

function sorted(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
