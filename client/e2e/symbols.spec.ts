// Browser smoke for Symbols mode on engine/examples/solid-route: the mode
// switch, a focus with its referrers and references, the kind filters, a hop
// opened in place, the inspector's reference lines, and the palette.
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
const stats = (page: Page) => page.locator("[data-symbol-stats]");

test.describe("Symbols mode on solid-route", () => {
  test("focus, filters, a hop opened in place, the inspector and the palette", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url({ view: "graph", symbols: "src/components/ViewerCard.tsx#ViewerCard" }));
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
    await expect(page.locator("[data-box]").first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "Symbols" })).toHaveAttribute("aria-checked", "true");
    await expect(stats(page)).toContainText("index:");
    const boxes = await page.locator("[data-box]").count();
    expect(boxes).toBeGreaterThan(1);
    await shot(page, "symbols-focus");

    // Hiding the type references drops boxes only they reach, and the status says so; the chip remembers.
    const types = page.locator('[data-ref-kind="type"]');
    await types.click();
    await expect(types).toHaveAttribute("aria-pressed", "false");
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready");
    await types.click();
    await expect(types).toHaveAttribute("aria-pressed", "true");

    // A click selects a box; the inspector lists its references with their lines.
    const side = page.locator("[data-box]").filter({ hasNot: page.locator(`[data-label="ViewerCard"]`) }).first();
    await side.click();
    await expect(page.locator("[data-symbol-inspector]")).toContainText("Selected symbol");
    await expect(page.locator("[data-symbol-inspector]")).toContainText(/Referenced by · \d+/);
    await shot(page, "symbols-inspector");
    // With nothing selected, the rail lists the repo's hubs and unreferenced symbols; a row centres on it.
    await page.keyboard.press("Escape");
    const lists = page.locator("[data-symbol-stats-lists]");
    await expect(lists).toContainText("Hubs");
    await expect(lists).toContainText(/Unreferenced · \d+/);
    await shot(page, "symbols-stats");

    // Shift-click on a box with more references than drawn opens its own hop in place: the URL lists it.
    const expandable = page.locator("[data-box][data-expandable]").first();
    if (await expandable.count()) {
      await expandable.click({ modifiers: ["Shift"] });
      await expect(page).toHaveURL(/open=/);
      await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready");
      await shot(page, "symbols-hop-opened");
    }

    // The palette finds any symbol of the index and centres the graph on it.
    await page.keyboard.press("/");
    const dialog = page.getByRole("dialog", { name: "Find a symbol" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Find a symbol").fill("RecordTable");
    await expect(dialog.locator("[data-symbol-hit]").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/symbols=src%2Fcomponents%2FRecordTable\.tsx%23RecordTable/);
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready");
    await shot(page, "symbols-palette-pick");

    // Back to Imports keeps the place; the mode switch round-trips.
    await page.getByRole("radio", { name: "Imports" }).click();
    await expect(page).not.toHaveURL(/symbols=/);
    await page.getByRole("radio", { name: "Symbols" }).click();
    await expect(page).toHaveURL(/symbols=/);
    expect(errors).toEqual([]);
  });

  test("a file focus draws its module and top-level symbols; a missing symbol says so", async ({ page }) => {
    await page.goto(url({ view: "graph", symbols: "src/components/RecordTable.tsx" }));
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
    await expect(page.locator(`[data-box][data-label="RecordTable"]`).first()).toBeVisible();
    await page.goto(url({ view: "graph", symbols: "src/components/RecordTable.tsx#Nope" }));
    await expect(page.getByText("Not in the index")).toBeVisible({ timeout: 90_000 });
  });
});

test.describe("Symbols mode paths on solid-route", () => {
  test("draws the chain from one symbol to another, says when there is none, and clears", async ({ page }) => {
    await page.goto(url({ view: "graph", symbols: "src/routes/records.tsx#RecordsRoute", to: "src/data/types.ts#RecordItem" }));
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
    await expect(stats(page)).toContainText(/reaches .* in \d+ steps?/);
    await expect(page.locator("[data-symbol-path]")).toBeVisible();
    expect(await page.locator("[data-box]").count()).toBeGreaterThanOrEqual(3);
    await shot(page, "symbols-path");
    // × leaves path mode for the neighbourhood of the same focus.
    await page.locator("[data-symbol-path]").getByRole("button", { name: "Back to the neighbourhood" }).click();
    await expect(page).not.toHaveURL(/to=/);
    await expect(stats(page)).toContainText("index:");
    await page.goto(url({ view: "graph", symbols: "src/components/ViewerCard.tsx#ViewerCard", to: "src/data/types.ts#RecordItem" }));
    await expect(stats(page)).toContainText("no chain of references", { timeout: 90_000 });
  });
});
