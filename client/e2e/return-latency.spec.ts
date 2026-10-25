// Return p95 over 20 returns (T17): the route graph, zoomed with a box
// selected, left for an anchor through the code viewer, then Return and
// Forward twenty times. Runs only when asked (SRCLY_MEASURE=1): it is a
// measurement, not a check, and the numbers go to measurements.md.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../engine/examples/solid-route");
const url = (params: Record<string, string>) => `/?${new URLSearchParams({ repo: REPO, ...params })}`;

test.skip(!process.env.SRCLY_MEASURE, "set SRCLY_MEASURE=1 to measure");

test("Return latency over 20 returns", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto(url({ view: "graph", flow: "/records" }));
  const status = page.getByText(/\d+ occurrences · \d+ boundaries|\d+ upstream · \d+ downstream/).first();
  await expect(status).toContainText("7 occurrences", { timeout: 90_000 });
  const svg = page.getByLabel("Dependency graph");
  const rect = (await svg.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  await page.locator('[data-box][data-label^="props.viewer?.name"]').first().click();
  const left = (await svg.locator("> g[transform]").first().getAttribute("transform"))!;
  await page.keyboard.press("o");
  const line = page.locator("span.line").filter({ hasText: "props.viewer?.name" }).first();
  await line.getByText("props.viewer?.name").click({ button: "right" });
  await page.locator("[data-inspect-menu][role=menu]").getByRole("menuitem", { name: /Trace where it goes/ }).click();
  await page.waitForURL(/anchor=/, { timeout: 15_000 }).catch(() => page.getByRole("listbox", { name: "Pick an expression" }).getByRole("option").first().click());
  await expect(status).toContainText("downstream", { timeout: 90_000 });
  await page.keyboard.press("Escape");
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = Date.now();
    await page.getByRole("button", { name: "Return" }).click();
    await page.waitForFunction(
      ([expected]) => {
        const g = document.querySelector('svg[aria-label="Dependency graph"] > g[transform]');
        return !location.search.includes("anchor=") && g?.getAttribute("transform") === expected && !!document.querySelector("[data-selected-ring]") && /\d+ occurrences/.test(document.body.innerText);
      },
      [left],
      { timeout: 30_000 },
    ).catch(async (error) => {
      const state = await page.evaluate(() => [location.search, document.querySelector('svg[aria-label="Dependency graph"] > g[transform]')?.getAttribute("transform"), document.querySelectorAll("[data-selected-ring]").length, /\d+ occurrences/.test(document.body.innerText), history.state]);
      console.log(`iteration ${i} timed out; expected ${left}; state ${JSON.stringify(state)}`);
      throw error;
    });
    times.push(Date.now() - t0);
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page).toHaveURL(/anchor=/);
    await expect(status).toContainText("downstream", { timeout: 60_000 });
    await page.waitForTimeout(100);
  }
  times.sort((a, b) => a - b);
  console.log(`returns ms: ${times.join(" ")}`);
  console.log(`p50 ${times[9]} p95 ${times[18]} max ${times[19]}`);
});
