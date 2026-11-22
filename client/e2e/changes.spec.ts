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

  test("deleted code opens at the base revision without disturbing its diff", async ({ page }) => {
    const base = execFileSync("git", ["rev-parse", "main"], { cwd: repo, encoding: "utf8" }).trim();
    const id = "src/worker.ts::legacyCleanup";
    await page.goto(`/?${new URLSearchParams({ repo, view: "changes" })}`);
    await lensReady(page);
    await chunk(page, id).click();
    const inspector = page.locator(`[data-chunk-inspector="${id}"]`);
    await inspector.locator('[data-action="open-diff"]').click();
    const diff = page.locator("[data-hunk-diff]");
    await expect(diff).toContainText("legacyCleanup");

    const fetched = page.waitForRequest((r) => {
      const url = new URL(r.url());
      return url.pathname === "/api/files/content" && url.searchParams.get("ref") === base;
    });
    await inspector.locator('[data-action="open-code"]').click();
    expect(new URL((await fetched).url()).searchParams.get("path")).toBe(path.join(repo, "src/worker.ts"));
    const code = page.getByRole("dialog");
    await expect(code.locator('[data-source-side="base"]')).toHaveAttribute("title", base);
    await expect(code.locator(".code-modal-content")).toContainText("export function legacyCleanup");
    await expect(code.getByRole("link", { name: "Open in VS Code" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(code).toHaveCount(0);
    await expect(chunk(page, id)).toHaveAttribute("data-selected", "");
    await expect(diff).toContainText("legacyCleanup");

    // An unavailable Git object must not fall back to the checked-out file.
    const requests: string[] = [];
    await page.route("**/api/files/content?**", async (route) => {
      requests.push(new URL(route.request().url()).searchParams.get("ref") ?? "disk");
      await route.fulfill({ status: 404, body: "Missing Git object" });
    });
    await inspector.locator('[data-action="open-code"]').click();
    await expect(code).toContainText(`Source unavailable at base ${base.slice(0, 7)}`);
    await expect(code.locator(".code-modal-content")).toHaveCount(0);
    expect(requests).toEqual([base]);
  });

  test("Open code follows a commit diff opened from the chunk's touch strip", async ({ page }) => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    const removedAt = git("log", "-1", "--format=%H", "--grep=worker: remove legacyCleanup");
    const previous = git("rev-parse", `${removedAt}^`);
    expect(previous).not.toBe(git("rev-parse", "main"));
    const id = "src/worker.ts::legacyCleanup";
    await page.goto(`/?${new URLSearchParams({ repo, view: "changes" })}`);
    await lensReady(page);
    await chunk(page, id).click();
    const inspector = page.locator(`[data-chunk-inspector="${id}"]`);
    await inspector.locator(`[data-touch="${removedAt}"]`).click();
    const diff = page.locator("[data-hunk-diff]");
    await expect(diff).toContainText(removedAt.slice(0, 7));
    await inspector.locator('[data-action="open-code"]').click();
    const code = page.getByRole("dialog");
    await expect(code.locator('[data-source-side="base"]')).toHaveAttribute("title", previous);
    await expect(code.locator(".code-modal-content")).toContainText("export function legacyCleanup");
  });
});

test("Changed paths carries a committed JSON diff through source, Compare, and Back", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-e2e-path-inventory-"));
  const source = path.join(dir, "repo");
  execFileSync("git", ["clone", "--quiet", "--no-local", repo, source]);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
  const snapshot = (name: string) => {
    git("add", "-A");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", name);
    return git("rev-parse", "HEAD");
  };
  const file = "config/model.json";
  const touched = "config/temporary-model.json";
  const write = (rel: string, value: string) => fs.writeFileSync(path.join(source, rel), `{ "origin": "${value}" }\n`);
  write(file, "parameter");
  write(touched, "original");
  const base = snapshot("Baseline data");
  write(file, "request");
  write(touched, "temporary");
  const step = snapshot("Update model tables");
  write(touched, "original");
  const head = snapshot("Restore the temporary model");

  await page.goto(`/?${new URLSearchParams({ repo: source, view: "changes", cw: "custom", cbase: base, chead: head })}`);
  await lensReady(page);
  await page.locator("[data-lens-toggle-paths]").press("Enter");
  const inventory = page.locator("[data-changed-paths]");
  await expect(inventory.locator("[data-changed-path]")).toHaveCount(2);
  const row = inventory.locator(`[data-changed-path="${file}"]`);
  await row.press("Enter");
  await expect(row).toHaveAttribute("aria-current", "true");
  const evidence = page.locator(`[data-path-evidence="${file}"]`);
  await expect(evidence.locator("[data-no-structural-metrics]")).toBeVisible();
  await expect(evidence.locator('[data-line="add"]')).toContainText("request");

  await evidence.locator('[data-source-line-side="head"][data-source-line="1"]').press("Enter");
  const code = page.getByRole("dialog");
  await expect(code.locator('[data-source-side="head"]')).toHaveAttribute("title", head);
  await expect(code.locator(".code-modal-content")).toContainText("request");
  await page.keyboard.press("Escape");
  await expect(code).toHaveCount(0);

  const receipt = new URL(page.url()).search;
  await evidence.locator("[data-path-compare]").press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("compare") === `${base}..${head}` && url.searchParams.get("cfile") === file);
  await expect(page.locator("[data-compare-path-handoff]")).toContainText(file);
  await expect(page).toHaveURL((url) => {
    const params = JSON.parse(url.searchParams.get("cchanges") ?? "{}");
    return params.source?.side === "head" && params.source?.revision === head && params.source?.startLine === 1;
  });
  await page.getByRole("button", { name: "Open after", exact: true }).press("Enter");
  await expect(code.locator('[data-source-side="head"]')).toHaveAttribute("title", head);
  await expect(code.locator(".code-modal-content")).toContainText("request");
  await page.keyboard.press("Escape");
  await expect(code).toHaveCount(0);
  await expect(page.locator("[data-compare-no-endpoint]")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.search === receipt);
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(evidence.locator('[data-line="add"]')).toContainText("request");

  const touchedRow = inventory.locator(`[data-changed-path="${touched}"]`);
  await touchedRow.press("Enter");
  const touchedEvidence = page.locator(`[data-path-evidence="${touched}"]`);
  await expect(touchedEvidence.locator("[data-diff-same]")).toBeVisible();
  const selector = touchedEvidence.getByLabel("Changed path evidence window");
  await selector.selectOption(step);
  await expect(touchedEvidence.locator('[data-line="add"]')).toContainText("temporary");
  await touchedEvidence.locator('[data-path-source="head"]').press("Enter");
  await expect(code.locator('[data-source-side="head"]')).toHaveAttribute("title", step);
  await page.keyboard.press("Escape");
  await selector.selectOption("");
  await touchedEvidence.locator("[data-path-compare]").press("Enter");
  await expect(page.locator("[data-compare-no-endpoint]")).toContainText("has no endpoint diff");
  await expect(page.getByRole("button", { name: "Open after", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL((url) => url.searchParams.get("cfile") === touched);
  await page.getByRole("button", { name: "Back to Changes" }).click();
  await expect(touchedRow).toHaveAttribute("aria-current", "true");
  await page.locator('[data-lens-group="mode"] [data-lens-option="net"]').click();
  await expect(touchedRow).toHaveCount(0);
  await expect(row).toBeVisible();
});

test("Dirty checkout can switch the path inventory to the committed range and back", async ({ page }) => {
  await page.goto(`/?${new URLSearchParams({ repo, view: "changes" })}`);
  await lensReady(page);
  await page.locator("[data-lens-toggle-paths]").press("Enter");
  const inventory = page.locator("[data-changed-paths]");
  await expect(inventory.getByRole("status")).toContainText("committed");
  const toggle = page.locator("[data-lens-worktree]");
  await expect(toggle).toContainText("Show committed range");
  const requestedCommitted = page.waitForResponse((r) => {
    const url = new URL(r.url());
    return url.pathname === "/api/change-lens" && url.searchParams.get("worktree") === "false" && r.ok();
  });
  await toggle.press("Enter");
  await requestedCommitted;
  await lensReady(page);
  await expect(page).toHaveURL((url) => url.searchParams.get("cworktree") === "off");
  await expect(inventory.locator("[data-changed-path]").first()).toBeVisible();
  await expect(toggle).toContainText("Include working tree");
  await toggle.press("Enter");
  await expect(inventory.getByRole("status")).toContainText("committed");
  await expect(page).toHaveURL((url) => !url.searchParams.has("cworktree"));
});
