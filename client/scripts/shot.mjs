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
  // The canvas may still move, so wait out --delay first, then find a point of the stroke the element is on top at.
  const hovered = values.hover ? page.locator(values.hover).first() : null;
  const onTarget = (point) => hovered.evaluate((el, at) => {
    const under = document.elementFromPoint(at.x, at.y);
    return !!under && (under === el || el.contains(under));
  }, point);
  if (hovered) await hovered.waitFor({ state: "attached" });
  // With --hover, bring a --selector target that is already visible into view now (one the hover reveals waits for it): scrolling during the capture would move the pointer off the hovered element.
  const target = values.selector ? page.locator(values.selector).first() : null;
  if (target && hovered && (await target.isVisible())) await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(Number(values.delay));
  if (hovered) {
    const points = await hovered.evaluate((el) => {
      if (el instanceof SVGGeometryElement && el.getTotalLength() > 0) {
        const length = el.getTotalLength();
        // From the middle outward along the whole stroke, ends included.
        const steps = Array.from({ length: 21 }, (_, index) => index / 20).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
        return steps.map((at) => el.getPointAtLength(length * at).matrixTransform(el.getScreenCTM())).map((p) => ({ x: p.x, y: p.y }));
      }
      const box = el.getBoundingClientRect();
      return [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    });
    let at = null;
    for (const point of points) if (!at && (await onTarget(point))) at = point;
    if (!at) {
      console.error(`--hover: no point of ${values.hover} is on top, so its hover state cannot be captured`);
      process.exit(1);
    }
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(300);
    // Still under the pointer as the capture is taken.
    if (!(await onTarget(at))) {
      console.error(`--hover: ${values.hover} moved away from the pointer before the capture`);
      process.exit(1);
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  if (target && !hovered) {
    await target.screenshot({ path: out });
  } else if (target) {
    // With --hover, the target may be what the hover opens (its card): find it now, and capture it as a clip of the page where it is, so nothing scrolls under the pointer.
    await target.waitFor();
    const clip = await target.boundingBox();
    if (!clip) {
      console.error(`--selector: ${values.selector} has no box to capture`);
      process.exit(1);
    }
    await page.screenshot({ path: out, clip });
  } else {
    await page.screenshot({ path: out, fullPage: values.full });
  }
  console.log(path.resolve(out));
} finally {
  await browser.close();
}
