// Data flow smoke on engine/examples/solid-route with the real engine (T6):
// the route picker, origin select, reach (R), the inspector (I), an anchor
// from the code viewer, the import-graph and treemap menus, and dark mode.
// Each step leaves a screenshot in tmp/e2e so a PR can attach it.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../engine/examples/solid-route");
const SHOTS = path.resolve(here, "../../tmp/e2e");
fs.mkdirSync(SHOTS, { recursive: true });

const url = (params: Record<string, string>) => `/?${new URLSearchParams({ repo: REPO, ...params })}`;
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
/** The status line under the canvas: a route's counts, or an anchor's. */
const status = (page: Page) => page.getByText(/\d+ occurrences · \d+ boundaries|\d+ upstream · \d+ downstream/).first();
/** A drawn box by its label text. */
const box = (page: Page, label: string) => page.locator("[data-box]").filter({ hasText: label }).first();

test.describe("Data flow on solid-route", () => {
  test("route graph: picker, origin select, reach and the inspector", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records" }));
    // The backbone may draw first; the complete graph is the one with origins.
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await expect(status(page)).toContainText("4 origins", { timeout: 90_000 });
    await expect(status(page)).not.toContainText("backbone");
    await shot(page, "route-graph");

    // The route picker opens on `/` and closes on Escape.
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Pick a route" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Pick a route" })).toContainText("/records");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Pick a route" })).toBeHidden();

    // Selecting an origin lights its proven destinations and lands in the URL.
    const origin = page.getByLabel("Origin whose proven destinations light up");
    const options = await origin.locator("option").allTextContents();
    const viewer = options.find((text) => text.includes("loadViewer"));
    expect(viewer, options.join(" | ")).toBeTruthy();
    await origin.selectOption({ label: viewer! });
    await expect(page).toHaveURL(/field=/);
    await shot(page, "route-origin-lit");

    // A click selects a box; R cycles the reach mode; I hides and shows the inspector.
    await box(page, "RecordTable").click();
    await expect(page.getByText("Selected box")).toBeVisible();
    await page.keyboard.press("r");
    await expect(page.getByRole("radiogroup", { name: "Reach direction" })).toBeVisible();
    await shot(page, "route-reach");
    const inspector = page.getByTitle("Show or hide the inspector (I)");
    await expect(inspector).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("i");
    await expect(inspector).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("i");
    await expect(inspector).toHaveAttribute("aria-pressed", "true");
  });

  test("anchor from the code viewer: trace where a prop read goes", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records" }));
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    // Double-click opens the box's code in the viewer: the render slot sits in ViewerCard.tsx.
    await box(page, "props.viewer?.na").dblclick();
    const line = page.locator("span.line").filter({ hasText: "props.viewer?.name" }).first();
    await expect(line).toBeVisible();
    await line.getByText("props.viewer?.name").click({ button: "right" });
    const menu = page.locator("[data-inspect-menu][role=menu]");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Trace where it goes/ }).click();
    // One candidate traces at once; several open the picker, where the first one will do.
    await page.waitForURL(/anchor=/, { timeout: 15_000 }).catch(async () => {
      await page.getByRole("listbox", { name: "Pick an expression" }).getByRole("option").first().click();
    });
    await expect(page).toHaveURL(/anchor=/);
    await expect(status(page)).toContainText("downstream");
    await shot(page, "anchor-from-code");
  });

  test("a selected box in anchor mode shows what its function touches", async ({ page }) => {
    await page.goto(url({ view: "graph", anchor: "src/components/ViewerCard.tsx@ViewerCard:3" }));
    await expect(status(page)).toContainText("upstream", { timeout: 90_000 });
    await box(page, "ViewerCard").click();
    const effects = page.getByLabel("Function effects");
    await expect(effects).toContainText("ViewerCard", { timeout: 60_000 });
    // A component that only renders props is closed under the assumptions, and says so.
    await expect(effects).toContainText(/Closed|known effect/);
    await effects.getByRole("button", { name: /assumptions/ }).click();
    await expect(effects).toContainText("intrinsics");
    await shot(page, "effects-inspector");
  });

  test("a lit edge, clicked, lists its steps in order in the inspector", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records" }));
    await expect(status(page)).toContainText("occurrences", { timeout: 90_000 });
    await page.getByLabel("Origin whose proven destinations light up").selectOption({ label: "createResource(loadViewer)" });
    await expect(page.getByText(/reaches \d+ proven/)).toBeVisible({ timeout: 90_000 });
    // The first lit edge: a transparent hit path whose drawn sibling carries the accent.
    const point = await page.evaluate(() => {
      for (const hit of document.querySelectorAll<SVGPathElement>('svg[aria-label="Dependency graph"] path[stroke="transparent"]')) {
        const drawn = hit.previousElementSibling;
        if (!(drawn instanceof SVGPathElement) || drawn.getAttribute("stroke") !== "var(--plc-accent)" || Number(drawn.getAttribute("stroke-opacity")) < 0.3) continue;
        const at = hit.getPointAtLength(hit.getTotalLength() / 2);
        const m = hit.getScreenCTM()!;
        return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
      }
      return null;
    });
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    const inspector = page.getByLabel("Data flow inspector");
    await expect(inspector).toContainText("Selected edge");
    await expect(inspector).toContainText(/\d+ steps/, { timeout: 60_000 });
    await expect(inspector).toContainText("origin");
    const rows = inspector.locator("ol li");
    expect(await rows.count()).toBeGreaterThan(1);
    // The last step is where the edge ends; opening a step is a click on its row.
    await expect(rows.last()).toContainText(/terminal|boundary/);
    await shot(page, "edge-steps");
    await page.keyboard.press("Escape");
    await expect(inspector).not.toContainText("Selected edge");
  });

  test("import graph menu: trace a symbol where it comes from", async ({ page }) => {
    await page.goto(url({ view: "graph", at: "src/components/ViewerCard.tsx" }));
    const symbol = page.locator('[data-box="center|src/components/ViewerCard.tsx#ViewerCard"]');
    await expect(symbol).toBeVisible({ timeout: 90_000 });
    await symbol.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Trace where it comes from/ }).click();
    await expect(page).toHaveURL(/anchor=.*ViewerCard/);
    await expect(page).toHaveURL(/dir=backward/);
    await expect(status(page)).toContainText("upstream", { timeout: 90_000 });
    await shot(page, "anchor-from-import-graph");
  });

  test("treemap menu: trace a function tile", async ({ page }) => {
    await page.goto(url({ view: "treemap", at: "src/components/ViewerCard.tsx" }));
    const canvas = page.getByLabel("Treemap. Use arrow keys to select a tile and Enter to open it.");
    await expect(canvas).toBeVisible({ timeout: 90_000 });
    // The file holds one function, so its tile fills the canvas: right-click its middle.
    const rect = (await canvas.boundingBox())!;
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2, { button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /Trace where it goes/ }).click();
    await expect(page).toHaveURL(/anchor=.*ViewerCard/);
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
    await shot(page, "anchor-from-treemap");
  });
});

test.describe("Stale sources", () => {
  test("an edit under an open graph shows Source changed; Refresh rebuilds the next generation", async ({ page }) => {
    const file = path.join(REPO, "src/components/MetricCard.tsx");
    const original = fs.readFileSync(file, "utf8");
    try {
      await page.goto(url({ view: "graph", flow: "/records" }));
      await expect(status(page)).toContainText("generation 1", { timeout: 90_000 });
      await expect(page.getByRole("status").filter({ hasText: "Source changed" })).toBeHidden();
      // Touch a source file the route's program includes.
      fs.writeFileSync(file, `${original}\n// edited by the smoke test\n`);
      const banner = page.getByRole("status").filter({ hasText: "Source changed. Refresh." });
      await expect(banner).toBeVisible({ timeout: 20_000 });
      // The old graph stays drawn, as generation 1, until the refresh lands.
      await expect(status(page)).toContainText("generation 1");
      await shot(page, "stale-banner");
      await banner.getByRole("button", { name: "Refresh" }).click();
      await expect(status(page)).toContainText("generation 2", { timeout: 90_000 });
      await expect(page.getByRole("status").filter({ hasText: "Source changed" })).toBeHidden();
      await expect(status(page)).toContainText("7 occurrences");
      await shot(page, "stale-refreshed");
    } finally {
      fs.writeFileSync(file, original);
    }
  });
});

test.describe("Data flow in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("the route graph and its legend render under prefers-color-scheme: dark", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records" }));
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await page.getByRole("button", { name: "Show legend" }).click().catch(() => undefined);
    await shot(page, "route-graph-dark");
    // Every box stroke keeps contrast against the canvas: no stroke equals the background.
    const bad = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      return [...document.querySelectorAll("[data-box] > rect")].map((r) => getComputedStyle(r).stroke).filter((s) => s === bg).length;
    });
    expect(bad).toBe(0);
  });
});
