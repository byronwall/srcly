import fs from "node:fs";
import path from "node:path";

// Ranks what stops data flow across a `survey-blockers.ts` run: repos the
// engine cannot open, traces that fail, and stops grouped by why, ranked by
// how many traces each cuts short. Markdown on stdout.
//
//   node --import tsx scripts/survey-report.ts tmp/survey > tmp/survey/REPORT.md

type Stop = { kind: string; reason: string | null; elementKind: string | null; detail: string | null; side: string; label: string; note: string | null; at: string };
type Trace = { file: string; name: string; kind: string; outcome: string; code?: string; message?: string; reason?: string | null; ms: number; stops?: Stop[]; budget?: { exhausted: boolean }; counts?: Record<string, number> };
type Repo = { repo: string; tier1: { ok: boolean; ms: number; files?: number | null; code?: string; message?: string }; exports?: { files: number; total: number; traceable: number; untraceableByKind: Record<string, number> }; traces?: Trace[] };

const dir = path.resolve(process.argv[2] ?? "tmp/survey");
const repos: Repo[] = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
const traces = repos.flatMap((repo) => (repo.traces ?? []).map((trace) => ({ ...trace, repo: repo.repo })));
const lines: string[] = [];
const say = (line = "") => lines.push(line);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");

say(`# Data-flow blocker survey`);
say();
say(`${repos.length} repos, ${traces.length} traces (each export traced both ways).`);
say();

say(`## Repos`);
say();
say(`| Repo | Program | Files | Exports traceable | Traces | ok | partial | error | p50 ms | max ms |`);
say(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
for (const repo of repos.sort((a, b) => a.repo.localeCompare(b.repo))) {
  const own = repo.traces ?? [];
  const ms = own.map((t) => t.ms).sort((a, b) => a - b);
  const by = (outcome: string) => own.filter((t) => t.outcome === outcome).length;
  const program = repo.tier1.ok ? `${repo.tier1.ms} ms` : `**${repo.tier1.code}**`;
  say(`| ${repo.repo} | ${program} | ${repo.tier1.files ?? "–"} | ${repo.exports ? `${repo.exports.traceable}/${repo.exports.total}` : "–"} | ${own.length} | ${by("ok")} | ${by("partial")} | ${by("error")} | ${ms[Math.floor(ms.length / 2)] ?? "–"} | ${ms.at(-1) ?? "–"} |`);
}
say();

const blocked = repos.filter((repo) => !repo.tier1.ok);
if (blocked.length) {
  say(`## Repos the engine cannot open`);
  say();
  for (const repo of blocked) say(`- **${repo.repo}**: \`${repo.tier1.code}\`: ${repo.tier1.message?.split("\n")[0]}`);
  say();
}

const untraceable: Record<string, number> = {};
for (const repo of repos) for (const [kind, n] of Object.entries(repo.exports?.untraceableByKind ?? {})) untraceable[kind] = (untraceable[kind] ?? 0) + n;
say(`## Exports with nothing to trace, by kind`);
say();
say(Object.entries(untraceable).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(" · ") || "none");
say();

say(`## Trace errors`);
say();
const errors = group(traces.filter((t) => t.outcome === "error"), (t) => `${t.code}: ${normalize(t.message ?? "")}`);
table(["Error", "Traces", "Repos", "Example"], errors.map((g) => [g.key, g.items.length, distinct(g.items, (t) => t.repo), `${g.items[0].repo} ${g.items[0].file} ${g.items[0].name}`]));

const finished = traces.filter((t) => t.outcome !== "error");
say(`## Where traces stop`);
say();
say(`${finished.length} traces finished: ${pct(finished.filter((t) => t.outcome === "ok").length, finished.length)} ok, ${pct(finished.filter((t) => t.outcome === "partial").length, finished.length)} partial. ${finished.filter((t) => t.budget?.exhausted).length} hit a size limit.`);
say();
say(`Ranked by the traces each stop cuts short: the first rows are the biggest unlocks.`);
say();
const stops = finished.flatMap((t) => (t.stops ?? []).map((stop) => ({ ...stop, trace: `${t.repo}/${t.file}#${t.name}`, repo: t.repo })));
const byWhy = group(stops, (s) => `${s.kind} · ${s.reason ?? "–"} · ${s.elementKind ?? "–"}`);
table(
  ["Stop (kind · reason · element)", "Traces", "Repos", "Stops", "Examples"],
  byWhy.map((g) => [g.key, distinct(g.items, (s) => s.trace), distinct(g.items, (s) => s.repo), g.items.length, examples(g.items)]).sort((a, b) => (b[1] as number) - (a[1] as number)),
);

say(`## Stops by detail, for the top reasons`);
say();
for (const g of byWhy.sort((a, b) => distinct(b.items, (s) => s.trace) - distinct(a.items, (s) => s.trace)).slice(0, 6)) {
  say(`### ${g.key}`);
  say();
  const sub = group(g.items, (s) => normalize(s.note ?? s.detail ?? s.label));
  table(["Note or detail", "Traces", "Example"], sub.map((s) => [s.key, distinct(s.items, (x) => x.trace), `${s.items[0].at} \`${s.items[0].label}\``]).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 12));
}

process.stdout.write(`${lines.join("\n")}\n`);

function group<T>(items: T[], key: (item: T) => string): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return [...map].map(([k, v]) => ({ key: k, items: v })).sort((a, b) => b.items.length - a.items.length);
}

function distinct<T>(items: T[], key: (item: T) => string): number {
  return new Set(items.map(key)).size;
}

/** Folds names, numbers and paths out of a message so like errors group. */
function normalize(text: string): string {
  return text.split("\n")[0].replace(/`[^`]*`/g, "`…`").replace(/"[^"]*"/g, '"…"').replace(/\b\d+\b/g, "N").replace(/\S+\.(tsx?|py)\b/g, "FILE").slice(0, 110).replaceAll("|", "\\|");
}

function examples(items: { label: string; at: string }[]): string {
  return [...new Set(items.map((s) => `\`${s.label.slice(0, 30).replaceAll("|", "\\|")}\``))].slice(0, 3).join(", ");
}

function table(head: string[], rows: (string | number)[][]) {
  if (!rows.length) {
    say("none");
    say();
    return;
  }
  say(`| ${head.join(" | ")} |`);
  say(`| ${head.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`);
  for (const row of rows) say(`| ${row.map((cell) => String(cell).replaceAll("\n", " ")).join(" | ")} |`);
  say();
}
