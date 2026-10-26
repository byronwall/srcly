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

- First thing in a fresh worktree: `scripts/bootstrap.sh` (node_modules, server venv, git hooks, `.claude/launch.json`).
- Dev servers: `preview_start` `srcly-api` then `srcly-client`. Each worktree has its own port pair (`scripts/dev-ports.sh`) and its client proxies to its own API; don't hand-edit ports. Read the main checkout through `git show origin/main:<path>`: `~/Projects/srcly` may be on another branch.
- `scripts/check.sh` runs what CI's `build` job runs (`client`, `engine`, `server`, or `--changed`); the pre-push hook runs `--changed`.
- Client types: `cd client && pnpm typecheck` (`tsc -b`). `tsc -p .` checks nothing: `client/tsconfig.json` only holds references.
- `browser` is `cd client && pnpm e2e` (Playwright, `client/e2e/`). Iterate on one test with `pnpm e2e -g "<name>"` (about 13s); run the whole suite once before the PR. Select by `data-*` attributes, never by drawn or truncated text or pixel positions: CI's Linux fonts are wider than macOS's.
- Screenshots: `cd client && pnpm shot <url> ../tmp/shots/<name>.png` (2x, waits for `data-scan-state="ready"`; `--dark`, `--click`, `--selector`). App URLs: `?repo=<abs path>&view=treemap|graph&at=<file>`.

## Finding code

Start with `docs/CODE_MAP.md`: a feature → file index for the backend, API, and client. When you add, move, or remove a feature's main files, update the matching row in the same change.

## Engine

`engine/` is the data-flow engine: tsx-data-flow's analysis behind a stdio protocol, a standalone pnpm package with its own lockfile. Provenance is in `engine/UPSTREAM.md`; the plan is `docs/intent/tsx-dataflow-integration/detailed-plan.md`.

- Install and check: `cd engine && pnpm install && pnpm test && pnpm typecheck && pnpm lint`.
- Run it from the server in a checkout with `SRCLY_ENGINE_DEV=1` (`dev.sh` and `scripts/dev-server.sh api` set it). The server runs `engine/bin/srcly-engine.ts` through the engine's own `tsx`, ahead of any bundle.
- uvicorn `--reload` doesn't restart the engine child. After editing `engine/src`, close it with `curl -X DELETE 'localhost:<api port>/api/dataflow?path=<scan root>'`; the next request starts a fresh one. No API restart needed.
- The wheel ships a bundle: `build-srcly.sh` runs `cd engine && pnpm bundle` (`engine/scripts/bundle.mjs`), which writes `server/app/engine/` (git-ignored, packaged through hatch `artifacts`). A path that climbs out of `src/` in a checkout must check `IS_BUNDLE` (`engine/src/srcly/bundle.ts`), because the bundle is one flat folder. Users still need Node 18+ on PATH (or `SRCLY_NODE`). Without Node or an engine, every data-flow endpoint answers `not-analyzed` with a reason; the scan never depends on it.
- Python owns the child (`server/app/services/dataflow/engine.py`): one lazy process per scan root, at most two alive, closed after 15 idle minutes. `SRCLY_DATAFLOW_TIMEOUT` overrides every request timeout.
- Memory: the session holds the primary Program only; the legacy report's routing Programs and identity index are built on its first `report()`. After each request, when the worker's heap after a full GC passes `SRCLY_DATAFLOW_MEMORY_MB` (default 2560; `0` switches it off), the worker drops the session (`engine/src/srcly/memory-guard.ts`); the rebuild keeps the generation when the hash is unchanged. A rebuilt session whose first request is still over the limit answers `memory-limit` (not analyzed, named) until a refresh. Measure with `cd engine && pnpm memory-probe --root <app> --exports 120`.
- To add an op: a Zod contract in `engine/src/srcly/contracts/` (and its `registry.ts` entry) → the op in `engine/src/srcly/ops/` and its worker branch → `cd engine && pnpm emit-contracts` → a Pydantic mirror in `server/app/services/dataflow/models.py` (`tests/test_dataflow_models.py` checks its fields against the schema) → a route in `server/app/routers/dataflow.py` → the client call. The emitted `server/app/services/dataflow/contracts/*.schema.json` and `client/src/dataflow/contract.generated.ts` are never edited by hand; `engine/test/srcly/contracts-current.test.ts` fails when they drift. Then `cd server && SRCLY_UPDATE_SNAPSHOTS=1 uv run pytest tests/test_dataflow_outcomes.py` writes the `tests/snapshots/fake-engine.*.json` files that `client/src/dataflow/shapes.test.ts` reads.
- Every result carries `generation` and `programHash`. A query with an older `expectedGeneration` is `stale`, a named outcome; never mix generations.
- Not analyzed is never 0: show the outcome or reason by name.
- Python roots: `engine/python/srcly_pyfacts.py` (stdlib `ast` + mypy, run with srcly's own interpreter) emits facts in the collector's raw shape; roles and boundaries come from the element kind, so new Python recognition goes in the helper's tables, never in `engine/src/analysis`. Its tests need an interpreter with mypy (`SRCLY_PYTHON`, else `server/.venv` after `cd server && uv sync`). Decision: `docs/intent/python-dataflow/decision.md`.
- Coverage survey: `engine/scripts/survey-blockers.ts` traces about 120 exports of one repo both ways and writes every outcome and stop as JSON; `engine/scripts/survey-report.ts <dir>` ranks the stops by how many traces each cuts short.
- Any script that builds a Program on a real repo (the survey, `pnpm memory-probe`, an ad-hoc spike) runs under `node --max-old-space-size=4096`, one repo per process, one process at a time across all sessions: a big repo's Program takes 2–3 GB, and parallel runs swap the Mac. `~/Projects/visual-notes` is the standard big-repo benchmark.
- A packaging change is done when the wheel works with dev mode off: `bash build-srcly.sh`, then `uv run --no-project --with ./server/dist/srcly-*.whl pytest scripts/test_package.py` (CI runs the same).
- A new analysis rule's test is its annotated fixture: add a file to `engine/examples/value-flow-basics/src/` with `@trace`, `@outcome`, `@reaches`, `@stop` and the other comment claims that `engine/test/srcly/fixture-annotations.test.ts` documents and checks, not a hand-written test that pins line numbers. `@reaches` and `@stop` are exhaustive, so a new terminal or stop fails until a fixture claims it.
- Coverage gate: `cd engine && pnpm survey-gate` (`engine/scripts/survey-gate.ts`, CI's `survey` job in `.github/workflows/survey.yml`) surveys `client/`, `server/` and `examples/value-flow-basics` (a fixed hash sample of exports) at a base and at the head and diffs them; nothing is committed. Both sides run one after the other in one worktree outside the checkout (some traces depend on the corpus's absolute path). Locally the head is the working tree and the base its merge base with `origin/main` (`git fetch` first; `--base <ref>` picks another); it needs `server/.venv` (`uv sync`). CI diffs the PR's merge commit against the base branch tip, about 2 minutes more than one survey.
- A move is any difference: outcome counts, stops by kind, the ok and error trace lists (the survey is deterministic, so there is no tolerance). Run `pnpm survey-gate` before pushing any change to the analysis or to the corpus. When it reports moves, put a `Survey moves:` line in the PR body that explains them; CI fails unacknowledged moves and re-runs when the body is edited. A new error, or a trace past 5 s (30 s for a repo's first, which builds the index), fails even when acknowledged.
- After merging, `survey-main` diffs each push to `main` against its first parent and compares that with the merged PR's own survey, so two PRs that move traces only together surface. It fails and keeps one issue, `Data-flow gate: unacknowledged moves on main`, up to date, and closes it on the next clean push.
- Open a data-flow PR, then run `gh pr merge <n> --squash --auto` and stop: auto-merge lands it when the checks pass. Don't run your own multi-repo surveys to prove a rule unless it targets code the gate's corpus doesn't contain.
- A new relation, element or proof kind gets one entry in `engine/src/srcly/kinds.ts` (`RELATION_TRAITS`, `ELEMENT_TRAITS`, `PROOF_TRAITS`); the engine does not build until it has one. Rules read its traits (`structural`, `crossCall`, `terminal`, a proof's `strength`), never their own lists of kind names.
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
