import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACK_LINE, acknowledged, difference, moves, newErrors, summarize, table, traceId, type Summaries, type Trace } from "./survey-gate-moves";

// A data-flow coverage gate. Surveys a small fixed corpus that lives in this
// repo (srcly's own client and server, and one example) twice, at a base
// commit and at the head, with each side's own engine and
// `survey-blockers.ts`, one repo per process, one process at a time, and
// diffs the two. Nothing is committed.
//
// Both sides are surveyed in one git worktree outside the checkout, the base
// checked out first and then the head (a snapshot commit of the working tree,
// untracked files included), because some traces depend on the corpus's
// absolute path: two folders can disagree on the same commit.
//
// Always fails on a survey that crashes, a repo the engine cannot open, a
// trace that newly errors, and a head trace past its time limit. Any other
// difference (trace counts, outcomes, stops by kind, the ok, assumed and error
// trace lists) is a move: CI fails it unless the PR body has a `Survey moves:` line
// explaining it. The survey is deterministic in one folder, so there is no tolerance.
//
//   pnpm survey-gate                        # the working tree against its merge base with origin/main
//   pnpm survey-gate --base <ref>           # against another commit
//   pnpm survey-gate --body-file pr.md      # also require `Survey moves:` in that body when anything moved (CI)
//   pnpm survey-gate --expect result.json   # require exactly the moves of an earlier run (the post-merge check on main)
//   pnpm survey-gate --survey-only          # survey and write the result, but don't judge it
//   pnpm survey-gate --reuse result.json    # judge an earlier result without surveying again
//
// Other flags: `--worktree <dir>` (where the surveyed worktree lives; default
// a folder in the OS temp dir, kept for the next run), `--out <file>` (the
// result JSON; default `engine/tmp/survey-gate/result.json`, beside `summary.md`).

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.dirname(ENGINE);
const OUT = path.join(ENGINE, "tmp/survey-gate");

/** A repo's first trace builds the shared evidence index, so it gets its own limit. Measured in CI: see AGENTS.md. */
const FIRST_TRACE_LIMIT_MS = 30_000;
const TRACE_LIMIT_MS = 5_000;

type Corpus = { name: string; dir: string; every: number; language?: "python" };
const CORPUS: Corpus[] = [
  { name: "client", dir: "client", every: 6 },
  { name: "value-flow-basics", dir: "engine/examples/value-flow-basics", every: 1 },
  { name: "server", dir: "server", every: 5, language: "python" },
];

type Side = { summaries: Summaries; failures: string[]; timing: string[]; ms: number; prepareMs: number };
type Result = { base: { ref: string; sha: string }; head: { sha: string; dirty: boolean }; sides: { base: Side; head: Side }; moves: string[] };
type Survey = { tier1: { ok: boolean; code?: string; message?: string }; traces?: Trace[] };

const args = parseArgs(process.argv.slice(2));
const resultFile = path.resolve(args.out ?? path.join(OUT, "result.json"));

const result: Result = args.reuse ? JSON.parse(fs.readFileSync(args.reuse, "utf8")) : surveyBoth();
if (!args.reuse) {
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
}
if (args["survey-only"]) {
  process.stdout.write(`\n${report(result, [], []).join("\n")}\n\nWrote ${path.relative(process.cwd(), resultFile)}; judge it with --reuse.\n`);
  process.exit(0);
}
judge(result);

function surveyBoth(): Result {
  const python = process.env.SRCLY_PYTHON ?? path.join(REPO, "server/.venv/bin/python");
  if (!fs.existsSync(python)) fail(`The Python survey needs ${path.relative(REPO, python)} (mypy): run \`uv sync\` in server/ first, or set SRCLY_PYTHON.`);
  const ref = args.base ?? "origin/main";
  const baseSha = args.base ? git(["rev-parse", "--verify", `${args.base}^{commit}`]) : mergeBase(ref);
  const dirty = git(["status", "--porcelain"]) !== "";
  const head = { sha: git(["rev-parse", "HEAD"]), dirty };
  process.stdout.write(`Survey gate: base ${baseSha.slice(0, 10)} (${args.base ? ref : `merge base with ${ref}`}), head ${head.sha.slice(0, 10)}${dirty ? " + working tree" : ""}\n`);
  const headSha = dirty ? snapshot() : head.sha;
  const dir = path.resolve(args.worktree ?? path.join(os.tmpdir(), `srcly-survey-${createHash("sha1").update(REPO).digest("hex").slice(0, 8)}`));

  // Base first: the head's time limits are then measured on a warm disk.
  const base = survey("base", baseSha, dir, python, false);
  const headSide = survey("head", headSha, dir, python, true);
  return { base: { ref, sha: baseSha }, head, sides: { base, head: headSide }, moves: moves(base.summaries, headSide.summaries) };
}

/** A commit of the working tree, untracked files included, made through a scratch index: the checkout, its index and its refs are untouched. */
function snapshot(): string {
  const index = path.join(os.tmpdir(), `srcly-survey-index-${process.pid}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(["read-tree", "HEAD"], env);
    git(["add", "--all"], env);
    const tree = git(["write-tree"], env);
    return git(["commit-tree", tree, "-p", "HEAD", "-m", "survey-gate: working tree"]);
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/**
 * Checks `sha` out in the detached worktree `dir` (made on first use) and
 * installs its engine and client from the shared pnpm store. Returns the
 * worktree's real path (the compiler reports files by real path, and macOS's
 * temp dir is a symlink) and the Python to survey its server with.
 */
function checkout(sha: string, dir: string, headPython: string): { root: string; python: string } {
  const common = realpath(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const existing = fs.existsSync(dir) ? spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"], { cwd: dir, encoding: "utf8" }) : null;
  const [theirCommon, theirTop] = existing?.status === 0 ? existing.stdout.trim().split("\n") : [];
  if (theirCommon && realpath(theirCommon) === common && realpath(theirTop) === realpath(dir)) {
    run("git", ["checkout", "--quiet", "--detach", "--force", sha], dir);
    run("git", ["clean", "--quiet", "-fd"], dir);
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
    run("git", ["worktree", "prune"], REPO);
    run("git", ["worktree", "add", "--quiet", "--detach", "--force", dir, sha], REPO);
  }
  for (const sub of ["engine", "client"]) run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline", "--reporter=silent"], path.join(dir, sub));
  if (!fs.existsSync(path.join(dir, "engine/scripts/survey-blockers.ts"))) fail(`${sha} has no engine/scripts/survey-blockers.ts to survey with.`);
  const root = fs.realpathSync(dir);
  // The server's interpreter only lends mypy and the server's dependencies; sync the worktree's own only when its lock differs.
  const lock = (repo: string) => fs.readFileSync(path.join(repo, "server/uv.lock"), "utf8");
  if (lock(dir) === lock(REPO)) return { root, python: headPython };
  run("uv", ["sync", "--locked", "--quiet"], path.join(dir, "server"));
  return { root, python: path.join(root, "server/.venv/bin/python") };
}

function survey(side: "base" | "head", sha: string, dir: string, headPython: string, timed: boolean): Side {
  const prepared = performance.now();
  const { root, python } = checkout(sha, dir, headPython);
  const started = performance.now();
  const out = path.join(OUT, side);
  fs.rmSync(out, { recursive: true, force: true });
  const summaries: Summaries = {};
  const failures: string[] = [];
  const timing: string[] = [];
  for (const repo of CORPUS) {
    process.stdout.write(`[${side}] `);
    const flags = ["--root", path.join(root, repo.dir), "--name", repo.name, "--out", out, "--every", String(repo.every), "--deadline", String(FIRST_TRACE_LIMIT_MS * 2)];
    if (repo.language) flags.push("--language", repo.language, "--python", python);
    // The side's own engine and tsx: `--import tsx` resolves from the working directory.
    const child = spawnSync(process.execPath, ["--max-old-space-size=3072", "--import", "tsx", "scripts/survey-blockers.ts", ...flags], { cwd: path.join(root, "engine"), stdio: ["ignore", "inherit", "inherit"] });
    const file = path.join(out, `${repo.name}.json`);
    if (child.status !== 0 || !fs.existsSync(file)) {
      failures.push(`${side} ${repo.name}: the survey exited ${child.status ?? child.signal}`);
      continue;
    }
    const parsed: Survey = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed.tier1.ok) failures.push(`${side} ${repo.name}: the engine cannot open it: ${parsed.tier1.code}: ${parsed.tier1.message?.split("\n")[0]}`);
    const traces = parsed.traces ?? [];
    summaries[repo.name] = summarize(traces);
    if (!timed) continue;
    traces.forEach((trace, index) => {
      const limit = index === 0 ? FIRST_TRACE_LIMIT_MS : TRACE_LIMIT_MS;
      if (trace.ms > limit) failures.push(`${repo.name}: ${traceId(trace)} took ${trace.ms} ms (limit ${limit} ms)`);
    });
    const slowest = traces.slice(1).reduce<Trace | null>((max, trace) => (!max || trace.ms > max.ms ? trace : max), null);
    timing.push(`${repo.name}: first trace ${traces[0]?.ms ?? "–"} ms, slowest after it ${slowest ? `${slowest.ms} ms (${traceId(slowest)})` : "–"}`);
  }
  return { summaries, failures, timing, ms: Math.round(performance.now() - started), prepareMs: Math.round(started - prepared) };
}

function judge(result: Result): never {
  const { base, head } = result.sides;
  const failures = [...base.failures, ...head.failures, ...newErrors(base.summaries, head.summaries).map((line) => `new error: ${line}`)];
  const notes: string[] = [];
  if (args.expect) {
    const expected: Result = JSON.parse(fs.readFileSync(args.expect, "utf8"));
    const { unexpected, missing } = difference(expected.moves, result.moves);
    if (unexpected.length || missing.length) {
      failures.push(`the moves differ from the expected run's (${path.basename(args.expect)}, base ${expected.base.sha.slice(0, 10)}):`);
      failures.push(...unexpected.map((line) => `  unexpected: ${line}`), ...missing.map((line) => `  expected but missing: ${line}`));
    } else if (result.moves.length) {
      notes.push(`The ${result.moves.length} moves match the expected run's.`);
    }
  } else if (result.moves.length) {
    const body = args["body-file"] === undefined ? null : fs.readFileSync(args["body-file"], "utf8");
    if (body === null) notes.push(`${result.moves.length} moves. CI fails them until the PR body has a \`${ACK_LINE}\` line that explains them.`);
    else if (acknowledged(body)) notes.push(`${result.moves.length} moves, acknowledged by the PR body's \`${ACK_LINE}\` line.`);
    else failures.push(`${result.moves.length} unacknowledged moves: add a \`${ACK_LINE}\` line to the PR body that explains them (editing the body re-runs this check).`);
  }
  const text = report(result, failures, notes).join("\n");
  process.stdout.write(`\n${text}\n`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "summary.md"), `${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Data-flow survey gate\n\n${text}\n`);
  process.exit(failures.length ? 1 : 0);
}

function report(result: Result, failures: string[], notes: string[]): string[] {
  const { base, head } = result.sides;
  const lines = [
    `Base \`${result.base.sha.slice(0, 10)}\` → head \`${result.head.sha.slice(0, 10)}\`${result.head.dirty ? " + working tree" : ""}. Surveys: base ${seconds(base.ms)}, head ${seconds(head.ms)}; checkout and install ${seconds(base.prepareMs)} and ${seconds(head.prepareMs)}.`,
    "",
    ...table(base.summaries, head.summaries),
    "",
    ...head.timing.map((line) => `- ${line}`),
  ];
  if (result.moves.length) lines.push("", `<details><summary>${result.moves.length} moves</summary>`, "", "```", ...result.moves, "```", "", "</details>");
  else lines.push("", "No moves.");
  if (notes.length) lines.push("", ...notes);
  if (failures.length) lines.push("", "**Survey gate failed:**", ...failures.map((line) => (line.startsWith("  ") ? `  - ${line.trim()}` : `- ${line}`)));
  else if (!args["survey-only"]) lines.push("", "Survey gate passed.");
  return lines;
}

function mergeBase(ref: string): string {
  const found = spawnSync("git", ["merge-base", "HEAD", ref], { cwd: REPO, encoding: "utf8" });
  if (found.status !== 0) fail(`No merge base with ${ref}: run \`git fetch origin\`, or pass --base <ref>.`);
  return found.stdout.trim();
}

function git(argv: string[], env: NodeJS.ProcessEnv = process.env): string {
  const child = spawnSync("git", argv, { cwd: REPO, encoding: "utf8", env });
  if (child.status !== 0) fail(`git ${argv.join(" ")}: ${child.stderr.trim()}`);
  return child.stdout.trim();
}

function run(command: string, argv: string[], cwd: string): void {
  const child = spawnSync(command, argv, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  if (child.status !== 0) fail(`${command} ${argv.join(" ")} (in ${cwd}) exited ${child.status ?? child.signal}`);
}

function realpath(file: string): string {
  return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  const valued = new Set(["base", "worktree", "body-file", "expect", "out", "reuse"]);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i].replace(/^--/, "");
    if (valued.has(flag)) flags[flag] = argv[++i];
    else if (flag === "survey-only") flags[flag] = "true";
    else fail(`Unknown flag ${argv[i]}. See the comment at the top of engine/scripts/survey-gate.ts.`);
  }
  return flags;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
