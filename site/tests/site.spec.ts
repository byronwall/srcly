import { expect, test } from "@playwright/test";

const guides = ["overview", "tour", "design", "get-started", "explore", "metrics", "findings", "data-flow", "reports", "cli", "configuration"];

test("every guide has readable static HTML and valid local links", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const links = new Set<string>();
  for (const slug of guides) {
    const response = await page.goto(`http://127.0.0.1:18588/srcly/docs/${slug}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".markdown")).toContainText("Srcly");
    await expect(page.locator(".markdown h2").first()).toBeVisible();
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(`https://byronwall.github.io/srcly/docs/${slug === "overview" ? "" : `${slug}/`}`);
    for (const image of await page.locator(".markdown img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    for (const link of await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))) {
      if (link.startsWith("http://127.0.0.1:18588/")) links.add(link.split("#")[0]);
    }
    for (const id of await page.locator('.toc a[href^="#"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!.slice(1)))) {
      expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
    }
  }
  for (const link of links) {
    const response = await request.get(link);
    expect(response.status(), link).toBe(200);
    if (response.headers()["content-type"]?.includes("text/html")) {
      expect(await response.text(), link).not.toContain("This page is not here.");
    }
  }
  await context.close();
});

test("real screenshots open at full size, zoom, and close by keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  for (const route of ["./", "docs/tour/"]) {
    await page.goto(route);
    const imageLink = page.locator('a[href$="/screenshots/treemap.jpg"]').first();
    await imageLink.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Screenshot viewer" });
    await expect(dialog).toBeVisible();
    const before = await dialog.locator("img").evaluate((image) => image.getBoundingClientRect().width);
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => dialog.locator("img").evaluate((image) => image.getBoundingClientRect().width)).toBeGreaterThan(before);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(imageLink).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("search finds guide content and direct navigation survives reload", async ({ page }) => {
  await page.goto("docs/get-started/");
  await page.locator("[data-doc-search]:visible").fill("ratchet");
  const result = page.locator('[data-search-result="cli"]:visible');
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toHaveText(/ratchet/i);
  await result.click();
  await expect(page).toHaveURL(/\/srcly\/docs\/cli\/#.+/);
  expect(await page.evaluate(() => !!document.getElementById(decodeURIComponent(location.hash.slice(1))))).toBe(true);
  await page.reload();
  await expect(page.locator(".markdown")).toContainText("--ratchet");
  await page.locator("[data-doc-search]:visible").fill("no-such-feature-9281");
  await expect(page.locator(".empty-search:visible")).toBeVisible();
});

test("mobile search and topics preserve the reading layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["./", "docs/", "docs/tour/", "docs/cli/"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  const before = await page.locator("h1").boundingBox();
  await page.locator("[data-topics-toggle]").click();
  await expect(page.locator("[data-topics-toggle]")).toHaveAttribute("aria-expanded", "true");
  expect((await page.locator("h1").boundingBox())?.y).toBe(before?.y);
  await page.locator('[data-mobile-topics] a[href$="/metrics/"]').click();
  await expect(page).toHaveURL(/\/srcly\/docs\/metrics\/$/);
  await expect(page.locator(".markdown")).toContainText("N/A");
  await page.locator("[data-doc-search]:visible").fill("ast-grep");
  await page.locator('[data-search-result="findings"]:visible').click();
  await expect(page).toHaveURL(/\/docs\/findings\/#.+/);
  expect(await page.evaluate(() => !!document.getElementById(decodeURIComponent(location.hash.slice(1))))).toBe(true);
});

test("copy feedback resets when copying successive code blocks", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("docs/get-started/");
  const buttons = page.locator("button[data-code-id]");
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await expect(buttons.nth(0)).toHaveText("Copy");
  await expect(buttons.nth(1)).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("uvx srcly");
  await expect(buttons.nth(1)).toHaveText("Copy", { timeout: 3000 });
});
