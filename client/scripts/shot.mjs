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
  // A bent edge's box centre can lie off its stroke, so rest on a point of the stroke itself, and check what is under it.
  if (values.hover) {
    const hovered = page.locator(values.hover).first();
    await hovered.waitFor({ state: "attached" });
    const at = await hovered.evaluate((el) => {
      if (el instanceof SVGGeometryElement && el.getTotalLength() > 0) {
        const point = el.getPointAtLength(el.getTotalLength() / 2).matrixTransform(el.getScreenCTM());
        return { x: point.x, y: point.y };
      }
      const box = el.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    await page.mouse.move(at.x, at.y);
    const hit = await hovered.evaluate((el, point) => {
      const under = document.elementFromPoint(point.x, point.y);
      return !!under && (under === el || el.contains(under));
    }, at);
    if (!hit) {
      console.error(`--hover: the point under the pointer is not ${values.hover}, so its hover state may be missing`);
      process.exitCode = 1;
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const target = values.selector ? page.locator(values.selector).first() : page;
  await page.waitForTimeout(Number(values.delay));
  await target.screenshot({ path: out, ...(values.selector ? {} : { fullPage: values.full }) });
  console.log(path.resolve(out));
} finally {
  await browser.close();
}
