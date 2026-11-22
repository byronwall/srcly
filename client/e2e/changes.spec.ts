// Browser smoke for the Changes view on the Change Lens acceptance repo
// (server/tests/fixtures/change_lens_repo.py): open Changes, select a chunk,
// read its diff, and see the reverted chunk leave when Net is picked.
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, "../../tmp/e2e");
fs.mkdirSync(SHOTS, { recursive: true });

let repo = "";
test.beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-e2e-lens-"));
  repo = execFileSync("uv", ["run", "--directory", path.resolve(here, "../../server"), "python", "-m", "tests.fixtures.change_lens_repo", path.join(dir, "repo")], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .pop()!;
});

const chunk = (page: Page, id: string) => page.locator(`[data-chunk="${id}"]`);
const lensReady = (page: Page) => expect(page.locator("[data-change-lens]")).toHaveAttribute("data-lens-state", "ready", { timeout: 60_000 });

test.describe("Changes view on the acceptance repo", () => {
  test("only edits, a chunk's diff, and reverted work in Touched but not Net", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?${new URLSearchParams({ repo, view: "changes" })}`);
    await lensReady(page);

    // Only edits: the edited functions, not the untouched ones of the same large file.
    await expect(chunk(page, "src/worker.ts::retryJob")).toBeVisible();
    await expect(chunk(page, "src/scheduler.ts::isIdle")).toHaveCount(0);
    await expect(chunk(page, "src/scheduler.ts::pickNext")).toHaveAttribute("data-state", "reverted");

    // A click selects the chunk: the breadcrumbs and the inspector follow it.
    await chunk(page, "src/worker.ts::retryJob").click();
    await expect(chunk(page, "src/worker.ts::retryJob")).toHaveAttribute("data-selected", "");
    await expect(page.locator('[data-crumb="src/worker.ts"]')).toBeVisible();
    const inspector = page.locator('[data-chunk-inspector="src/worker.ts::retryJob"]');
    await expect(inspector.locator('[data-metric="complexity"]')).toContainText("5");

    // Open diff shows the chunk's own lines.
    await inspector.locator('[data-action="open-diff"]').click();
    const diff = page.locator("[data-hunk-diff]");
    await expect(diff.locator('[data-line="add"]').first()).toBeVisible();
    await expect(diff).toContainText("retryJob");
    await expect(diff).not.toContainText("parseArgs");
    await page.screenshot({ path: path.join(SHOTS, "changes-diff.png") });

    // Net drops the reverted chunk and keeps the selection.
    await page.locator('[data-lens-group="mode"] [data-lens-option="net"]').click();
    await expect(chunk(page, "src/scheduler.ts::pickNext")).toHaveCount(0);
    await lensReady(page);
    await expect(chunk(page, "src/worker.ts::retryJob")).toHaveAttribute("data-selected", "");
    await page.screenshot({ path: path.join(SHOTS, "changes-net.png") });
    expect(errors).toEqual([]);
  });
});
