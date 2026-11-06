import { expect, test } from "@playwright/test";

const guides = ["get-started", "explore", "metrics", "findings", "data-flow", "reports", "cli", "configuration"];

test("every guide has readable static HTML and valid local links", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const links = new Set<string>();
  for (const slug of guides) {
    const response = await page.goto(`http://127.0.0.1:18588/srcly/docs/${slug}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".markdown")).toContainText("Srcly");
    await expect(page.locator(".markdown h2").first()).toBeVisible();
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(`https://byronwall.github.io/srcly/docs/${slug}/`);
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
    expect(await response.text(), link).not.toContain("This page is not here.");
  }
  await context.close();
});

test("the example responds to file and metric selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.locator('[data-file="cache.ts"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-selected-file]")).toHaveText("cache.ts");
  const before = await page.locator('[data-file="cache.ts"]').evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.locator('[data-metric="comment-noise"]').click();
  await expect(page.locator('[data-metric="comment-noise"]')).toHaveAttribute("aria-pressed", "true");
  const after = await page.locator('[data-file="cache.ts"]').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
  expect(errors).toEqual([]);
});

test("search finds guide content and direct navigation survives reload", async ({ page }) => {
  await page.goto("docs/get-started/");
  await page.locator("[data-doc-search]").fill("ratchet");
  await expect(page.locator('[data-search-result="cli"]')).toBeVisible();
  await page.locator('[data-search-result="cli"]').click();
  await expect(page).toHaveURL(/\/srcly\/docs\/cli\/$/);
  await page.reload();
  await expect(page.locator(".markdown")).toContainText("--ratchet");
  await page.locator("[data-doc-search]").fill("no-such-feature-9281");
  await expect(page.locator(".empty-search")).toBeVisible();
});

test("mobile navigation works without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["./", "docs/get-started/", "docs/cli/"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.locator("[data-topics-toggle]").click();
  await expect(page.locator("[data-topics-toggle]")).toHaveAttribute("aria-expanded", "true");
  await page.locator('[data-mobile-topics] a[href$="/metrics/"]').click();
  await expect(page).toHaveURL(/\/srcly\/docs\/metrics\/$/);
  await expect(page.locator(".markdown")).toContainText("N/A");
});
