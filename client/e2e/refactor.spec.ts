import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let root: string;
test.beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-refactor-browser-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler" }, include: ["src"] }));
  fs.writeFileSync(path.join(root, "src/state.ts"), "export const count = 1;\n");
  fs.writeFileSync(path.join(root, "src/consumer.ts"), 'import { count } from "./state";\nexport const double = () => count * 2;\n');
  for (const args of [["init", "-q"], ["config", "user.email", "test@srcly.invalid"], ["config", "user.name", "Srcly test"], ["add", "."], ["commit", "-qm", "fixture"]]) execFileSync("git", args, { cwd: root });
});

test("refactoring vertical slice: visual plan, compiler preview, apply, undo and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?${new URLSearchParams({ repo: root, view: "refactor" })}`);
  await expect(page.locator("[data-refactor-view]")).toBeVisible();
  await page.locator("[data-refactor-load]").click();
  await page.locator('[data-refactor-file="src/state.ts"]').click();
  await page.locator("[data-refactor-destination]").fill("src/model/state.ts");
  await page.locator("[data-refactor-add]").click();
  await expect(page.locator("[data-refactor-dsl]")).toHaveValue(/move-file \$file_1 -> "src\/model\/state.ts"/);
  await page.locator("[data-refactor-preview]").click();
  await expect(page.locator("[data-refactor-run-status]")).toHaveText("ready", { timeout: 90_000 });
  await expect(page.locator("[data-refactor-diff]")).toContainText("model/state");
  await expect(page.locator('[data-refactor-node="src/model/state.ts"]')).toBeVisible();
  const shots = path.resolve("../tmp/e2e");
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, "refactor-preview.png"), fullPage: true });
  await page.locator("[data-refactor-next]").click();
  await expect(page.locator("[data-refactor-run-status]")).toHaveText("complete");
  const worktree = (await page.locator("[data-refactor-worktree]").textContent())!;
  expect(fs.existsSync(path.join(worktree, "src/model/state.ts"))).toBe(true);
  expect(fs.readFileSync(path.join(worktree, "src/consumer.ts"), "utf8")).toContain("./model/state");
  expect(fs.readFileSync(path.join(root, "src/consumer.ts"), "utf8")).toContain('"./state"');
  await page.reload();
  await expect(page.locator("[data-refactor-run-status]")).toHaveText("complete");
  await page.locator("[data-refactor-undo]").click();
  await expect(page.locator("[data-refactor-run-status]")).toHaveText("ready");
  expect(fs.existsSync(path.join(worktree, "src/state.ts"))).toBe(true);
  await page.screenshot({ path: path.join(shots, "refactor-checkpoint.png"), fullPage: true });
  expect(errors).toEqual([]);
});
