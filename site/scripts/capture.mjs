// Captures the site's screenshots and data from a real Srcly run on Srcly's own source.
//
//   cd site && node scripts/capture.mjs [name,name… | data] [--ref <git ref>]   (data: no screenshots)
//
// Needs the server venv (`cd server && uv sync`), client node_modules, and Google Chrome.
// It clones this checkout at `origin/main` (or --ref) to a temporary `srcly` folder (so the shots show the
// repository's own name and Git history), starts the API and the client dev server on
// free ports with a temporary cache, then writes:
//
//   public/screenshots/*.jpg  app screenshots (1440 × 900 CSS px at 1.5x)
//   src/data/tree.json        folder and file sizes and complexity, for the hero treemap
//   src/data/catalog.json     the metric catalog and 2×2 presets the reference tables use
//   src/data/cli.json         real output of a few headless commands
//   src/data/meta.json        the source revision and totals the page cites
//
// The data-flow and symbols shots use the checked-in engine/examples/symbol-graph fixture:
// a small app with a route, because a trace over the whole repository takes minutes.
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const site = fileURLToPath(new URL("..", import.meta.url));
const repo = join(site, "..");
const shots = join(site, "public/screenshots");
const data = join(site, "src/data");
const args = process.argv.slice(2);
const refAt = args.indexOf("--ref");
const ref = refAt >= 0 ? args.splice(refAt, 2)[1] : "origin/main";
const only = args[0]?.split(",");

// realpath: macOS reports /var/folders/… as /private/var/folders/… in the scan.
const root = await realpath(await mkdtemp(join(tmpdir(), "srcly-site-")));
const clone = join(root, "srcly");
const fixture = join(clone, "engine/examples/symbol-graph");
const env = { ...process.env, SRCLY_CACHE_DIR: join(root, "cache"), SRCLY_ENGINE_DEV: "1" };
execFileSync("git", ["clone", "-q", repo, clone]);
const commit = execFileSync("git", ["-C", repo, "rev-parse", ref], { encoding: "utf8" }).trim();
execFileSync("git", ["-C", clone, "checkout", "-q", "--detach", commit]);
const sha = execFileSync("git", ["-C", clone, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
const date = execFileSync("git", ["-C", clone, "log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
console.log(`source ${sha} (${date}) in ${clone}`);

const srcly = (...args) => execFileSync("uv", ["run", "--quiet", "--directory", join(repo, "server"), "python", "-m", "app.run", ...args], {
  env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28,
});

const freePort = () => new Promise((done) => {
  const server = createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => done(port));
  });
});
const api = await freePort();
const client = await freePort();
const children = [
  spawn("uv", ["run", "--quiet", "--directory", join(repo, "server"), "python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(api)], { env, stdio: "ignore" }),
  spawn(join(repo, "client/node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(client), "--strictPort"], {
    cwd: join(repo, "client"), env: { ...env, SRCLY_API_PORT: String(api) }, stdio: "ignore",
  }),
];
const stop = () => children.forEach((child) => child.kill());
process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
await waitFor(`http://127.0.0.1:${api}/api/metrics/catalog`);
await waitFor(`http://127.0.0.1:${client}/`);

// Data first: the scan warms the cache the app then loads.
await mkdir(data, { recursive: true });
const full = JSON.parse(srcly("scan", clone, "--out", "-"));
const fileTypes = new Set(["file"]);
const slim = (node) => {
  const out = { n: node.name, l: node.metrics?.loc ?? 0 };
  // Short keys keep the file small: c = max complexity, m = commits (90 days), f = findings. Absent is N/A.
  for (const [key, id] of [["c", "complexity"], ["m", "commit_count"], ["f", "finding_count"]]) {
    const value = node.metrics?.[id];
    if (value !== null && value !== undefined) out[key] = Math.round(value);
  }
  if (node.type === "folder") out.k = (node.children ?? []).filter((child) => child.type === "folder" || fileTypes.has(child.type)).map(slim).filter((child) => child.l > 0);
  return out;
};
await writeFile(join(data, "tree.json"), JSON.stringify({ ...slim(full), n: "srcly" }));

const catalog = await (await fetch(`http://127.0.0.1:${api}/api/metrics/catalog`)).json();
await writeFile(join(data, "catalog.json"), JSON.stringify({
  groups: catalog.groups,
  metrics: catalog.metrics.map(({ id, label, short_label, unit, group, direction, aggregation, languages, description, witness, color_domain, color_per_file }) =>
    ({ id, label, short_label, unit, group, direction, aggregation, languages, description, witness, color_domain, color_per_file })),
  windows: catalog.activity_windows,
  presets: catalog.quadrant_presets.map(({ id, label, description, x, y, cohorts, quadrants }) =>
    ({ id, label, description, x: x.label, y: y.label, cohorts, quadrants: quadrants.map(({ name, description: text }) => ({ name, text })) })),
}, null, 1));

const cli = {
  hotspots: srcly("hotspots", clone, "--metric", "complexity", "--cohort", "function", "--limit", "6"),
  explain: srcly("explain", clone, "--at", "client/src/viz/treemap"),
};
await writeFile(join(data, "cli.json"), JSON.stringify(Object.fromEntries(Object.entries(cli).map(([key, text]) =>
  [key, text.replaceAll(root, "/tmp").trimEnd()])), null, 1));

const m = full.metrics;
await writeFile(join(data, "meta.json"), JSON.stringify({
  sha, date, version: (await readFile(join(clone, "server/pyproject.toml"), "utf8")).match(/^version = "(.+)"/m)?.[1],
  loc: m.loc, files: m.file_count, functions: m.function_count,
  topCcn: Math.round(m.complexity), topCcnName: m.complexity_witness?.name,
  topCcnPath: m.complexity_witness?.path.split("::")[0].replace(`${clone}/`, ""),
  findings: m.finding_count,
}, null, 1));

// Screenshots.
const app = (path, params) => `http://127.0.0.1:${client}/?${new URLSearchParams({ repo: path, ...params })}`;
const views = [
  { name: "treemap", url: app(clone, { view: "treemap" }) },
  { name: "hotspots", url: app(clone, { view: "treemap" }), steps: async (page) => page.getByRole("tab", { name: "Hot Spots" }).click() },
  { name: "quadrant", url: app(clone, { view: "scatter", preset: "activity", cohort: "file", quadrant: "high_both" }) },
  {
    name: "code-inspector", url: app(clone, { view: "treemap", at: "client/src/viz/deps" }),
    // The witness button shows on row hover; force skips the visibility wait.
    steps: async (page) => page.getByRole("button", { name: /^Open buildViewModel/ }).first().click({ force: true }),
    ready: '[role="dialog"]', delay: 3000,
  },
  { name: "graph", url: app(clone, { view: "graph", at: "client/src/viz/treemap" }), delay: 2500 },
  {
    // Compare checks out and scans both revisions, then shows the risk metrics summary.
    name: "compare", url: app(clone, { view: "treemap", compare: "5a8a9c38~1..5a8a9c38" }), delay: 3000, timeout: 600_000,
    steps: async (page) => page.getByText("Risk metrics", { exact: true }).first().waitFor(),
  },
  { name: "symbols", url: app(fixture, { view: "graph", symbols: "src/routes/notes/[id].tsx#NotePage" }), delay: 4000 },
  { name: "data-flow", url: app(fixture, { view: "graph", anchor: "src/routes/notes/[id].tsx@NotePage:6", dir: "forward" }), ready: "text=Where the trace stops", delay: 2000 },
];

const browser = await chromium.launch({ channel: "chrome", args: ["--use-mock-keychain", "--password-store=basic"] });
try {
  for (const view of views.filter((item) => !only || only.includes(item.name))) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    page.setDefaultTimeout(view.timeout ?? 180_000);
    try {
      await page.goto(view.url, { waitUntil: "domcontentloaded" });
      if (!view.url.includes("compare=")) await page.locator('[data-scan-state="ready"]').first().waitFor();
      await page.addStyleTag({ content: ".plc-toast { display: none !important; }" });
      if (view.steps) await view.steps(page);
      if (view.ready) await page.locator(view.ready).first().waitFor();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(view.delay ?? 800);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: join(shots, `${view.name}.jpg`), type: "jpeg", quality: 82 });
      console.log(`${view.name}.jpg`);
    } catch (error) {
      process.exitCode = 1;
      console.error(`${view.name}: ${error.message.split("\n")[0]}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  stop();
  await rm(root, { recursive: true, force: true });
}
