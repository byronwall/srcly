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

  test("a source trace switches immediately from Symbols to Data flow and survives Back and Forward", async ({ page }) => {
    await page.goto(url({ view: "graph", symbols: "src/components/ViewerCard.tsx#ViewerCard" }));
    const mode = page.getByRole("radiogroup", { name: "Graph mode" });
    await expect(mode.getByRole("radio", { name: "Symbols" })).toHaveAttribute("aria-checked", "true");
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
    await page.locator('[data-box][data-label="ViewerCard"]').first().dblclick();
    const line = page.locator("span.line").filter({ hasText: "props.viewer?.name" }).first();
    const expression = line.getByText("props.viewer?.name");
    await expect(expression).toBeVisible();
    await expression.click({ button: "right" });
    await page.locator("[data-inspect-menu]").getByRole("menuitem", { name: /Trace where it goes/ }).click();
    await page.waitForURL(/anchor=/, { timeout: 15_000 }).catch(async () => {
      await page.getByRole("listbox", { name: "Pick an expression" }).getByRole("option").first().click();
    });
    await expect(page).toHaveURL(/anchor=.*&dir=forward/);
    await expect(mode.getByRole("radio", { name: "Data flow" })).toHaveAttribute("aria-checked", "true");
    await expect(stats(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/symbols=/);
    await expect(mode.getByRole("radio", { name: "Symbols" })).toHaveAttribute("aria-checked", "true");
    await page.goForward();
    await expect(page).toHaveURL(/anchor=.*&dir=forward/);
    await expect(mode.getByRole("radio", { name: "Data flow" })).toHaveAttribute("aria-checked", "true");
  });

  test("a file focus draws its module and top-level symbols; a missing symbol says so", async ({ page }) => {
    await page.goto(url({ view: "graph", symbols: "src/components/RecordTable.tsx" }));
    await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
    await expect(page.locator(`[data-box][data-label="RecordTable"]`).first()).toBeVisible();
    await page.goto(url({ view: "graph", symbols: "src/components/RecordTable.tsx#Nope" }));
    await expect(page.getByText("Not in the index")).toBeVisible({ timeout: 90_000 });
  });

  test("explain when a tree file isn't eligible for structural views", async ({ page }) => {
    await page.goto(url({ view: "graph", at: "README.md" }));
    const notice = page.locator("[data-imports-excluded]");
    await expect(notice).toContainText("README.md is in the tree but not in Imports", { timeout: 90_000 });
    await page.goto(url({ view: "graph", symbols: "README.md" }));
    await expect(page.getByText("Not in the index")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Symbols indexes JavaScript, TypeScript and Python source/)).toBeVisible();
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

// Show references in the code viewer resolves the name by its position, through the checker:
// `Row` is both a type and a value in src/m.ts, and each use opens its own side.
test.describe("Show references by position", () => {
  const fixture = path.resolve(here, "../../engine/test/srcly/__fixtures__/symbol-refs");

  /** Right-click the `nth` occurrence of `text` on the code line that contains `context`, then Show references. */
  async function showReferences(page: Page, context: string, text: string) {
    const line = page.getByRole("dialog").locator("span.line").filter({ hasText: context });
    await line.scrollIntoViewIfNeeded();
    const point = await line.evaluate((el, word) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let all = "";
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) all += node.textContent;
      let offset = all.indexOf(word) + 1;
      for (const node of nodes) {
        if (offset < node.textContent!.length) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const { x, y, width, height } = range.getBoundingClientRect();
          return { x: x + width / 2, y: y + height / 2 };
        }
        offset -= node.textContent!.length;
      }
      throw new Error(`${word} is not rendered`);
    }, text);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.locator("[data-inspect-menu][role=menu]").getByRole("menuitem", { name: /Show references/ }).click();
  }

  for (const [context, focus] of [
    ['typed: import("./m").Row', "src/m.ts#Row@type"],
    ['typeof import("./m").Row', "src/m.ts#Row"],
  ] as const) {
    test(`a use of a split name opens ${focus}`, async ({ page }) => {
      await page.goto(`/?${new URLSearchParams({ repo: fixture, view: "treemap", at: "src" })}`);
      await page.getByRole("treeitem", { name: /use\.tsx/ }).click();
      await showReferences(page, context, "Row");
      await expect.poll(() => new URL(page.url()).searchParams.get("symbols"), { timeout: 90_000 }).toBe(focus);
      await expect(stats(page)).toHaveAttribute("data-symbol-stats", "ready", { timeout: 90_000 });
      if (focus.endsWith("@type")) await shot(page, "symbols-show-references-by-position");
    });
  }
});
