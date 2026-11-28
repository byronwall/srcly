---
id: task-checkers-record-which-rules-ran-on-which-files
label: Checkers record which rules ran on which files
type: task
status: planned
parent: area-findings-checker-coverage
---
Checkers do not record which rules ran on which files, so `srcly findings` (and every findings total) infers coverage from tool names and file lists.

## Evidence

Codex review of `srcly findings`, round 3. Recompute: in `server/`, `uv run python -m app.run findings . --rule F401` reads N/A although ruff runs F401 on every file and finds none.

- A ruff or eslint rule with no finding is always N/A, so such a cleanup cannot prove zero.
- The unfiltered total accepts "any checker checked a file": a tsc run that listed no file in the target is masked by another checker.
- An ast-grep pack has one file list, so a TypeScript rule gets credit for Python files in a mixed pack. A quoted `"id":` key is not read as an id. An ast-grep id equal to a ruff or tsc code hides that tool's failure.
- Older gaps below the command: ESLint or ruff parse errors still give clean counts; `tsc` project errors are dropped when `--listFiles` prints files; nested flat ESLint configs are dropped without a reason; the cache fingerprint misses checker inputs outside the scan; an unreadable file is skipped by `duplicate-type`.

## Design

Each checker returns a coverage record per rule: files checked, files excluded, why incomplete. `listing.py` derives counts from those records only. Reuse a cached record only when the checker inputs still match.

## Files

`server/app/services/findings/` (`listing.py`, `model.py`, `runner.py`, `typescript.py`, `ruff.py`, `astgrep.py`, `duplicate_types.py`).

## Done

In `server/`, `findings . --rule F401` reads 0, and reads N/A when the project config switches F401 off. Each evidence case above gives N/A. Per-rule counts on Visual Notes `app` sum to the per-tool counts of `srcly report`.

