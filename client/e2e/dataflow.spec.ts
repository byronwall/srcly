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
/** A drawn box by the start of its full label: the drawn text truncates to the font's width, which differs by platform. */
const boxLabelled = (page: Page, label: string) => page.locator(`[data-box][data-label^="${label}"]`).first();

test.describe("Data flow on solid-route", () => {
  test("route graph: picker, origin select, reach and the inspector", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
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

  test("a page route opens on its component's data, and the lens switch shows its render tree", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records" }));
    await expect(page).toHaveURL(/anchor=.*RecordsRoute.*dir=forward/);
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
    const lens = page.getByRole("radiogroup", { name: "Route lens" });
    await expect(lens.getByRole("radio", { name: "Data" })).toHaveAttribute("aria-checked", "true");
    await shot(page, "route-data");
    await lens.getByRole("radio", { name: "Components" }).click();
    await expect(page).toHaveURL(/lens=components/);
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await page.getByRole("radiogroup", { name: "Route lens" }).getByRole("radio", { name: "Data" }).click();
    await expect(page).toHaveURL(/anchor=.*RecordsRoute/);
  });

  test("anchor from the code viewer: trace where a prop read goes", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    // Double-click opens the box's code in the viewer: the render slot sits in ViewerCard.tsx.
    await boxLabelled(page, "props.viewer?.name").dblclick();
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
    await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
    await expect(status(page)).toContainText("occurrences", { timeout: 90_000 });
    await page.getByLabel("Origin whose proven destinations light up").selectOption({ label: "createResource(loadViewer)" });
    await expect(page.getByText(/reaches \d+ proven/)).toBeVisible({ timeout: 90_000 });
    // A lit edge that opens its steps. The click goes to the edge itself: where it is drawn
    // depends on the platform's fonts, and a box may sit over any given point of it.
    await page.locator("path[data-edge][data-active][data-selectable]").first().dispatchEvent("click");
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

  test("Return restores the place as it was left: camera, selection, metric", async ({ page }) => {
    await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    const svg = page.getByLabel("Dependency graph");
    const camera = svg.locator("> g[transform]").first();
    // Leave the route graph as a particular place: zoomed in, a box selected, another metric.
    const rect = (await svg.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    // The render slot in ViewerCard.tsx: O opens that file, where the trace starts.
    await boxLabelled(page, "props.viewer?.name").click();
    await expect(svg.locator("[data-selected-ring]")).toHaveCount(1);
    const metricButton = page.getByRole("button", { name: /^Color/ });
    await metricButton.click();
    const option = page.getByRole("listbox", { name: "Color" }).locator("[role=option][aria-selected=false]").first();
    const metricLabel = (await option.locator("span").nth(1).textContent())!.trim();
    await option.click();
    await expect(metricButton).toContainText(metricLabel);
    const left = (await camera.getAttribute("transform"))!;
    expect(left).not.toBe("");
    // Trace into anchor mode from the code viewer: an in-app move, so a Back step. O opens the selected box's code and keeps it selected.
    await page.keyboard.press("o");
    const line = page.locator("span.line").filter({ hasText: "props.viewer?.name" }).first();
    await expect(line).toBeVisible();
    await line.getByText("props.viewer?.name").click({ button: "right" });
    await page.locator("[data-inspect-menu][role=menu]").getByRole("menuitem", { name: /Trace where it goes/ }).click();
    await page.waitForURL(/anchor=/, { timeout: 15_000 }).catch(async () => {
      await page.getByRole("listbox", { name: "Pick an expression" }).getByRole("option").first().click();
    });
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
    await page.keyboard.press("Escape");
    await expect(svg.locator("[data-selected-ring]")).toHaveCount(0);
    // Return: the route graph, zoomed and selected as it was left, with the metric it was left with.
    await page.getByRole("button", { name: "Return" }).click();
    await expect(page).toHaveURL(/flow=%2Frecords/);
    await expect(page).not.toHaveURL(/anchor=/);
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await expect(camera).toHaveAttribute("transform", left);
    await expect(svg.locator("[data-selected-ring]")).toHaveCount(1);
    await expect(metricButton).toContainText(metricLabel);
    await shot(page, "returned");
    // Forward lands on the anchor again, plain.
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page).toHaveURL(/anchor=/);
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
  });

  test("the Recent menu lists the anchors and routes traced in this tab, and walks back to one", async ({ page }) => {
    await page.goto(url({ view: "graph", anchor: "src/components/ViewerCard.tsx@ViewerCard:3", dir: "forward" }));
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
    // The route picker is an in-app move: a second place in this tab.
    await page.getByRole("button", { name: "Routes", exact: true }).filter({ hasText: /^Routes$/ }).first().click();
    // A page route opens on its component's data; its render tree is one click away.
    await page.getByRole("dialog", { name: "Pick a route" }).getByRole("option", { name: /\/records/ }).click();
    await expect(page).toHaveURL(/anchor=.*RecordsRoute/);
    await page.getByRole("radiogroup", { name: "Route lens" }).getByRole("radio", { name: "Components" }).click();
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await page.getByRole("button", { name: "Recent anchors and routes" }).click();
    const menu = page.getByRole("menu", { name: "Recent anchors and routes" });
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("/records");
    await expect(items.nth(1)).toContainText("RecordsRoute");
    await expect(items.nth(2)).toContainText("ViewerCard");
    await expect(items.nth(2)).toContainText("to");
    await expect(items.nth(2)).toContainText("src/components/ViewerCard.tsx");
    await shot(page, "recent-menu");
    await items.nth(2).click();
    await expect(page).toHaveURL(/anchor=.*ViewerCard/);
    await expect(status(page)).toContainText("downstream", { timeout: 90_000 });
    // Forward and Return walk the same history.
    await page.getByRole("button", { name: "Return" }).click();
    await expect(page).toHaveURL(/flow=route/);
    await expect(page).not.toHaveURL(/anchor=/);
    await page.getByRole("button", { name: "Forward" }).click();
    await expect(page).toHaveURL(/anchor=.*ViewerCard/);
  });

  test("a folder anchor fans out to its exports; an export opens in place into its own trace", async ({ page }) => {
    await page.goto(url({ view: "graph", anchor: "src/components@*", dir: "forward" }));
    const footer = page.getByText(/\d+ exports in \d+ files · \d+ traceable/).first();
    await expect(footer).toBeVisible({ timeout: 90_000 });
    await expect(footer).toContainText("0 opened");
    await expect(box(page, "ViewerCard")).toBeVisible();
    await expect(box(page, "MetricCard")).toBeVisible();
    await shot(page, "folder-anchor");
    // Shift-click opens the export in place: its forward trace, in a frame of its own.
    await box(page, "ViewerCard").click({ modifiers: ["Shift"] });
    await expect(page).toHaveURL(/open=.*ViewerCard/);
    await expect(footer).toContainText("1 opened", { timeout: 90_000 });
    // The export's own forward trace joins the six boxes already drawn (the folder and its five exports).
    await expect.poll(() => page.locator("[data-box]").count(), { timeout: 90_000 }).toBeGreaterThan(6);
    await expect(page.locator("[data-box]").filter({ hasText: /handed to a component|return/ }).first()).toBeVisible();
    await shot(page, "folder-anchor-opened");
    // The other exports stay as they were: one box each, still openable.
    await expect(box(page, "MetricCard")).toBeVisible();
  });

  test("a second anchor joins the canvas from the inspector; boxes both traces reach are marked", async ({ page }) => {
    await page.goto(url({ view: "graph", anchor: "src/components/ViewerCard.tsx@ViewerCard:3", dir: "backward" }));
    await expect(status(page)).toContainText("upstream", { timeout: 90_000 });
    const before = await page.locator("[data-box]").count();
    // Select an expression box the trace reached and add it as an anchor of its own (by its span).
    await box(page, "viewer()").click();
    const inspector = page.getByLabel("Data flow inspector");
    await expect(inspector).toContainText("Selected box");
    await inspector.getByRole("button", { name: "Add to the trace" }).click();
    await expect(page).toHaveURL(/anchor=[^&]*%7C/);
    // The viewer() call's own backward walk reaches the resource the first trace already drew: shared, by element id.
    const stats = page.getByText(/2 anchors · [1-9]\d* shared box/).first();
    await expect(stats).toBeVisible({ timeout: 90_000 });
    // The second anchor is a chip that can be removed; the toolbar says Anchors.
    await expect(page.getByText("Anchors", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Remove anchor/ })).toHaveCount(1);
    expect(await page.locator("[data-box]").count()).toBeGreaterThanOrEqual(before);
    await shot(page, "two-anchors");
    await page.getByRole("button", { name: /Remove anchor/ }).click();
    await expect(page).not.toHaveURL(/%7C/);
    await expect(status(page)).toContainText("upstream", { timeout: 90_000 });
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

test.describe("Field labels on compact-field-proof", () => {
  const COMPACT = path.resolve(here, "../../engine/examples/compact-field-proof");

  test("no field label covers a box (T22)", async ({ page }) => {
    await page.goto(`/?${new URLSearchParams({ repo: COMPACT, view: "graph", flow: "/projects", lens: "components" })}`);
    await expect(status(page)).toContainText("occurrences", { timeout: 180_000 });
    await expect(status(page)).toContainText("origins", { timeout: 180_000 });
    const origin = page.getByLabel("Origin whose proven destinations light up");
    await expect(origin.locator("option").filter({ hasText: /^readFile\(/ })).toHaveCount(1, { timeout: 60_000 });
    await origin.selectOption({ label: (await origin.locator("option").allTextContents()).find((t) => t.startsWith("readFile("))! });
    await expect(page.getByText(/reaches \d+ proven/)).toBeVisible({ timeout: 180_000 });
    await expect(page.locator("[data-edge-label]").first()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(800);
    await shot(page, "field-labels");
    const overlaps = await page.evaluate(() => {
      const rect = (el: Element) => el.getBoundingClientRect();
      const boxes = [...document.querySelectorAll("[data-box] > rect")].map(rect);
      const labels = [...document.querySelectorAll<SVGTextElement>("[data-edge-label]")];
      return labels
        .map((label) => ({ id: label.getAttribute("data-edge-label"), text: label.textContent, hits: boxes.filter((b) => { const l = rect(label); return l.left < b.right && l.right > b.left && l.top < b.bottom && l.bottom > b.top; }).length }))
        .filter((l) => l.hits > 0);
    });
    expect(overlaps).toEqual([]);
    expect(await page.locator("[data-edge-label]").count()).toBeGreaterThan(0);
  });
});

test.describe("Stale sources", () => {
  test("an edit under an open graph shows Source changed; Refresh rebuilds the next generation", async ({ page }) => {
    const file = path.join(REPO, "src/components/MetricCard.tsx");
    const original = fs.readFileSync(file, "utf8");
    try {
      await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
      await expect(status(page)).toHaveAttribute("data-generation", "1", { timeout: 90_000 });
      await expect(page.getByRole("status").filter({ hasText: "Source changed" })).toBeHidden();
      // Touch a source file the route's program includes.
      fs.writeFileSync(file, `${original}\n// edited by the smoke test\n`);
      const banner = page.getByRole("status").filter({ hasText: "Source changed. Refresh." });
      await expect(banner).toBeVisible({ timeout: 20_000 });
      // The old graph stays drawn, as generation 1, until the refresh lands.
      await expect(status(page)).toHaveAttribute("data-generation", "1");
      await shot(page, "stale-banner");
      await banner.getByRole("button", { name: "Refresh" }).click();
      await expect(status(page)).toHaveAttribute("data-generation", "2", { timeout: 90_000 });
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
    await page.goto(url({ view: "graph", flow: "/records", lens: "components" }));
    await expect(status(page)).toContainText("7 occurrences", { timeout: 90_000 });
    await page.getByRole("button", { name: "Show legend" }).click().catch(() => undefined);
    await shot(page, "route-graph-dark");
    // Every box stroke keeps contrast against the canvas: no stroke equals the background.
    const bad = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      return [...document.querySelectorAll("[data-box] > rect")].map((r) => getComputedStyle(r).stroke).filter((s) => s === bg).length;
    });
    expect(bad).toBe(0);
    // Every box label reads on its tinted fill (T21): WCAG contrast of at least 4.5 against the fill the mark's token mixed in.
    const contrast = await page.evaluate(() => {
      const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const luminance = (css: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
        if (!m) return null;
        const [r, g, b] = [m[1], m[2], m[3]].map((x) => channel(Number(x) / 255));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const out: { box: string; ratio: number }[] = [];
      for (const box of document.querySelectorAll<SVGGElement>("[data-box]")) {
        const rect = box.querySelector(":scope > rect");
        const text = box.querySelector("text");
        if (!rect || !text) continue;
        const fill = luminance(getComputedStyle(rect).fill);
        const ink = luminance(getComputedStyle(text).fill);
        if (fill === null || ink === null) continue;
        const ratio = (Math.max(fill, ink) + 0.05) / (Math.min(fill, ink) + 0.05);
        out.push({ box: box.getAttribute("data-box") ?? "", ratio: Math.round(ratio * 100) / 100 });
      }
      return out;
    });
    expect(contrast.length).toBeGreaterThan(5);
    expect(contrast.filter((c) => c.ratio < 4.5)).toEqual([]);
    // The marks are drawn in palette tokens, never a literal color.
    const literal = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Dependency graph"] g[style]')].map((g) => g.getAttribute("style") ?? "").filter((s) => /color:\s*#|color:\s*rgb/.test(s)).length);
    expect(literal).toBe(0);
  });
});
