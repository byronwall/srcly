// Full-resolution screenshots of the running app, for PRs and UI passes.
// The browser pane scales captures to ~800px; this takes them at 2x.
//
//   pnpm shot <url> <out.png> [--width 1440] [--height 900] [--scale 2] [--dark]
//             [--wait-for <selector>] [--click <selector>]... [--hover <selector>] [--full] [--selector <el>] [--delay <ms>]
//
// --hover rests the pointer on an element after the clicks, so a hover card or
// an emphasis state is in the capture (a native `title` tooltip never is).
//
// It waits for the scan to finish painting (`data-scan-state="ready"` on the app
// shell) before --wait-for, so a capture never catches the progress panel.
//
// The url is usually this worktree's client (scripts/dev-ports.sh), e.g.
//   pnpm shot "http://localhost:15405/?repo=/path/to/repo&view=graph" ../tmp/shots/graph.png
// Keep output in the repo's ignored tmp/ (never commit screenshots).
// First run on a new machine: pnpm exec playwright install chromium
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    scale: { type: "string", default: "2" },
    dark: { type: "boolean", default: false },
    "wait-for": { type: "string" },
    click: { type: "string", multiple: true, default: [] },
    hover: { type: "string" },
    full: { type: "boolean", default: false },
    selector: { type: "string" },
    timeout: { type: "string", default: "60000" },
    // A canvas that animates into place (the graph's edges settle) needs a moment after it appears.
    delay: { type: "string", default: "0" },
  },
});

const [url, out] = positionals;
if (!url || !out) {
  console.error("usage: pnpm shot <url> <out.png> [--width] [--height] [--scale] [--dark] [--wait-for] [--click]... [--hover] [--full] [--selector]");
  process.exit(2);
}

const timeout = Number(values.timeout);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(values.width), height: Number(values.height) },
    deviceScaleFactor: Number(values.scale),
    colorScheme: values.dark ? "dark" : "light",
  });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (err) => console.error(`page error: ${err.message}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.locator('[data-scan-state="ready"], [data-scan-state="error"]').first().waitFor({ timeout });
  if (await page.locator('[data-scan-state="error"]').count()) console.error("warning: the scan ended in an error");
  if (values["wait-for"]) await page.locator(values["wait-for"]).first().waitFor();
  for (const selector of values.click) {
    await page.locator(selector).first().click();
    await page.waitForLoadState("networkidle");
  }
  // `force` hovers an SVG edge under another layer, as a pointer resting there would.
  // An edge's hit area has a transparent stroke, which Playwright counts as hidden: wait for it to exist, not to show.
  if (values.hover) {
    const hovered = page.locator(values.hover).first();
    await hovered.waitFor({ state: "attached" });
    await hovered.hover({ force: true });
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const target = values.selector ? page.locator(values.selector).first() : page;
  await page.waitForTimeout(Number(values.delay));
  await target.screenshot({ path: out, ...(values.selector ? {} : { fullPage: values.full }) });
  console.log(path.resolve(out));
} finally {
  await browser.close();
}
