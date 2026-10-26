# Agents

## Pull requests and releases

- Use a Conventional Commit title for each PR. CI checks the title.
- Use `fix: ...` for fixes and `feat: ...` for new features.
- Use `perf: ...`, `deps: ...`, or `revert: ...` for those changes.
- Use `docs: ...`, `refactor: ...`, `test: ...`, `build: ...`, `ci: ...`, `chore: ...`, or `style: ...` for maintenance.
- Add `!` before the colon for breaking changes, such as `feat!: remove an API`.
- An optional scope is valid, such as `fix(scan): stop cancelled scans`.
- Squash merge PRs. Keep the PR title as the squash commit title.
- Merge a stack with `gh stack merge`, never layer by layer: #28 and #31 were squashed into bases that had already merged and never reached `main`.
- `PR title`, `build` and `browser` are required. Wait with `gh pr checks <n> --watch`, not one status read, before merging or stacking the next PR.
- Do not bump versions, add change fragments, or push release tags for normal changes.
- Release Please opens and updates the release PR after changes merge into `main`.
- Review and squash merge that PR when a release is wanted. Do not merge it without user approval.
- The release PR updates `CHANGELOG.md`, `.release-please-manifest.json`, `server/pyproject.toml`, and `server/uv.lock`.
- Client and server changes share one release. Only `srcly` is published; the client stays private.
- Release Please creates the `v<version>` tag and GitHub release. The Release action publishes to PyPI.
- Check the Release action and PyPI before reporting a release as complete.
- For workflow setup, token renewal, and failed releases, use `docs/releases.md`.

## Checks

- First thing in a fresh worktree: `scripts/bootstrap.sh` (node_modules, server venv, git hooks).
- `scripts/check.sh` runs what CI's `build` job runs (`client`, `engine`, `server`, or `--changed`); the pre-push hook runs `--changed`.
- Client types: `cd client && pnpm typecheck` (`tsc -b`). `tsc -p .` checks nothing: `client/tsconfig.json` only holds references.
- `browser` is `cd client && pnpm e2e` (Playwright, `client/e2e/`). Select by `data-*` attributes, never by drawn or truncated text or pixel positions: CI's Linux fonts are wider than macOS's.

## Finding code

Start with `docs/CODE_MAP.md`: a feature → file index for the backend, API, and client. When you add, move, or remove a feature's main files, update the matching row in the same change.

## Engine

`engine/` is the data-flow engine: tsx-data-flow's analysis behind a stdio protocol, a standalone pnpm package with its own lockfile. Provenance is in `engine/UPSTREAM.md`; the plan is `docs/intent/tsx-dataflow-integration/detailed-plan.md`.

- Install and check: `cd engine && pnpm install && pnpm test && pnpm typecheck && pnpm lint`.
- Run it from the server in a checkout with `SRCLY_ENGINE_DEV=1` (`dev.sh` sets it). The server runs `engine/bin/srcly-engine.ts` through the engine's own `tsx`, ahead of any bundle.
- The wheel ships a bundle: `build-srcly.sh` runs `cd engine && pnpm bundle` (`engine/scripts/bundle.mjs`), which writes `server/app/engine/` (git-ignored, packaged through hatch `artifacts`). A path that climbs out of `src/` in a checkout must check `IS_BUNDLE` (`engine/src/srcly/bundle.ts`), because the bundle is one flat folder. Users still need Node 18+ on PATH (or `SRCLY_NODE`). Without Node or an engine, every data-flow endpoint answers `not-analyzed` with a reason; the scan never depends on it.
- Python owns the child (`server/app/services/dataflow/engine.py`): one lazy process per scan root, at most two alive, closed after 15 idle minutes. `SRCLY_DATAFLOW_TIMEOUT` overrides every request timeout.
- Memory: the session holds the primary Program only; the legacy report's routing Programs and identity index are built on its first `report()`. After each request, when the worker's heap after a full GC passes `SRCLY_DATAFLOW_MEMORY_MB` (default 2560; `0` switches it off), the worker drops the session (`engine/src/srcly/memory-guard.ts`); the rebuild keeps the generation when the hash is unchanged. A rebuilt session whose first request is still over the limit answers `memory-limit` (not analyzed, named) until a refresh. Measure with `cd engine && pnpm memory-probe --root <app> --exports 120`.
- To add an op: a Zod contract in `engine/src/srcly/contracts/` (and its `registry.ts` entry) → the op in `engine/src/srcly/ops/` and its worker branch → `cd engine && pnpm emit-contracts` → a Pydantic mirror in `server/app/services/dataflow/models.py` (`tests/test_dataflow_models.py` checks its fields against the schema) → a route in `server/app/routers/dataflow.py` → the client call. The emitted `server/app/services/dataflow/contracts/*.schema.json` and `client/src/dataflow/contract.generated.ts` are never edited by hand; `engine/test/srcly/contracts-current.test.ts` fails when they drift.
- Every result carries `generation` and `programHash`. A query with an older `expectedGeneration` is `stale`, a named outcome; never mix generations.
- Not analyzed is never 0: show the outcome or reason by name.
- Python roots: `engine/python/srcly_pyfacts.py` (stdlib `ast` + mypy, run with srcly's own interpreter) emits facts in the collector's raw shape; roles and boundaries come from the element kind, so new Python recognition goes in the helper's tables, never in `engine/src/analysis`. Its tests need an interpreter with mypy (`SRCLY_PYTHON`, else `server/.venv` after `cd server && uv sync`). Decision: `docs/intent/python-dataflow/decision.md`.
- Coverage survey: `engine/scripts/survey-blockers.ts` traces about 120 exports of one repo both ways and writes every outcome and stop as JSON; `engine/scripts/survey-report.ts <dir>` ranks the stops by how many traces each cuts short. Run one repo per process, one at a time, under `node --max-old-space-size=4096`: a big repo's Program takes 2–3 GB.
- Never edit `engine/src/analysis` to recognise srcly-specific code. The only planned analysis edits are M5's four invocation-identity changes, each with a negative fixture.

## Client Package Management

Use `pnpm` for all package management operations.

- Install: `pnpm install`
- Add: `pnpm add <package>`
- Run: `pnpm run <script>`
- Direct run: `pnpm dlx ...`

When adding deps, always call `pnpm add` instead of modifying package.json directly.

## Python Guide

Use `uv` for all Python operations
Create proper tests for new functionality, using `pytest` instaed of ad hoc scripts.
To run tests, `cd server && uv run pytest`.

To add or change a metric, follow `docs/adding-a-metric.md`. `N/A` is `None`, never 0.
