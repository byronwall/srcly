// Browser smoke for Data flow mode (`e2e/`): the real engine on
// engine/examples/solid-route, through the Python API and a Vite preview of the built client.
// `pnpm e2e` runs it; CI runs it as the `browser` job. Screenshots land in
// ../tmp/e2e (ignored), so a PR can attach them.
import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// CI uses fixed ports. Locally each worktree runs on its own pair (its dev ports
// + 800, see scripts/dev-ports.sh), so e2e runs in two worktrees don't collide.
const [API_PORT, CLIENT_PORT] = process.env.CI
  ? [8765, 5199]
  : execFileSync("bash", [path.join(here, "../scripts/dev-ports.sh")], { encoding: "utf8" })
      .trim()
      .split(" ")
      .map((port) => Number(port) + 800);
// A cold analysis cache every run: the smoke must scan and trace from nothing, as CI does.
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-e2e-cache-"));

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../tmp/e2e/results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../tmp/e2e/report" }]] : "list",
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `uv run --directory ../server uvicorn app.main:app --port ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/metrics/catalog`,
      cwd: here,
      env: { SRCLY_ENGINE_DEV: "1", SRCLY_CACHE_DIR: cacheDir },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // A production build, not the dev server: on a cold cache Vite finds new deps mid-test and reloads the page.
      command: `pnpm exec vite build --outDir ../tmp/e2e/dist --emptyOutDir && pnpm exec vite preview --outDir ../tmp/e2e/dist --port ${CLIENT_PORT} --strictPort`,
      url: `http://localhost:${CLIENT_PORT}`,
      cwd: here,
      env: { SRCLY_API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
