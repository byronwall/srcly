// Browser check for Compare's path filter: it lives in the URL with the ref
// pair, so it survives the source overlay, Back, Forward and a refresh.
// The fixture mirrors srcly's own f2544ff^..f2544ff shape (a `models/` filter
// keeps 3 of the changed files) in a temp repo, since CI checks out one commit.
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../tmp/e2e");
fs.mkdirSync(SHOTS, { recursive: true });

const FILES = ["src/app.ts", "src/models/user.ts", "src/models/order.ts", "src/models/cart.ts", "src/util/math.ts"];

test("Compare path filter survives source, Close, Escape, Back, Forward and refresh", async ({ page }) => {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "srcly-e2e-compare-")), "repo");
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const write = (body: (name: string) => string) => {
    for (const rel of FILES) {
      fs.mkdirSync(path.join(repo, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(repo, rel), body(path.basename(rel, ".ts")));
    }
    git("add", "-A");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "snapshot");
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  const base = write((n) => `export function ${n}(x: number) {\n  return x;\n}\n`);
  const head = write((n) => `export function ${n}(x: number) {\n  if (x > 1) return x * 2;\n  return x;\n}\n`);

  const rows = page.locator("[data-compare-file][data-changed]");
  const filter = page.locator("[data-compare-filter]");
  const dialog = page.getByRole("dialog");
  const filtered = async () => {
    await expect(filter).toHaveValue("models/");
    await expect(rows).toHaveCount(3);
  };

  await page.goto(`/?${new URLSearchParams({ repo })}`);
  // The in-app way into a review: a pushed compare URL.
  await page.evaluate((href) => {
    window.history.pushState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/?${new URLSearchParams({ repo, compare: `${base}..${head}` })}`);
  await expect(rows).toHaveCount(5, { timeout: 60_000 });

  const entries = await page.evaluate(() => window.history.length);
  await filter.fill("models/");
  await filtered();
  await expect(page).toHaveURL((url) => url.searchParams.get("cq") === "models/");
  // Typing replaces the entry: Back still walks review steps, not keystrokes.
  expect(await page.evaluate(() => window.history.length)).toBe(entries);

  await rows.first().click();
  await page.locator('[data-compare-open="head"]').click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "compare-filter-source.png") });
  await page.getByRole("button", { name: "Close (Esc)" }).click();
  await expect(dialog).toHaveCount(0);
  await filtered();

  await page.locator('[data-compare-open="head"]').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await filtered();

  await page.goBack();
  await expect(page).toHaveURL((url) => !url.searchParams.has("compare"));
  await expect(filter).toHaveCount(0);

  await page.goForward();
  await filtered();
  await expect(page).toHaveURL((url) => url.searchParams.get("cq") === "models/");

  await page.reload();
  await filtered();
  await page.screenshot({ path: path.join(SHOTS, "compare-filter-refresh.png") });
});
