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
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
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
