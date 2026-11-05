# Agent reporting plan

Build a concise, evidence-first CLI for repository, folder, file and symbol investigation. Fix misleading results first. Then prove that saved analysis and scoped queries improve a real agent audit before committing to a larger contract. The [research summary](../../research/agent-reporting-2026-10/README.md) records the decision and review. The [original Pro materials](assets/pro-results/2026-10-31/INDEX.md) include detailed examples and a 100-case craft ledger.

## 1. Repair the current commands

Fix compare summaries in `server/app/services/compare/diff.py`: unavailable metrics must not become zero or produce a false improvement. Separate coverage changes from source additions and deletions; compare paired populations where appropriate. Represent missing graph coverage as unknown. Update client compare types and display if the API changes.

Route cache warnings in `findings/runner.py`, `activity.py` and other acquisition paths to stderr. Test JSON stdout with an actual failing cache boundary. Preserve zero and analysis status in compact evidence. Resolve `explain --file` against the requested root, validate limits, and make artifact references and refresh behavior truthful. Check whether truncation affects the existing gate before changing it. Tests should cover 12 → unavailable, unavailable → 12, mixed measured populations, failed graph coverage, cwd outside the target, zero/negative limits, and cache write failure. Update CLI documentation and the shipped skill. Ship these repairs without waiting for new commands.

## 2. Prove reusable analysis

Measure a complete repository → folder → file → symbol investigation on a fixed corpus against the current CLI. Record provider invocations, latency, output bytes and useful evidence. Prototype saving and reusing the existing analysis tree before designing a broad snapshot framework. Prove queries do not rescan and make source freshness and partial coverage visible. Keep paths relative to the scan root. Check whether a simple JSON artifact is sufficient and record invalidation limits. Treat detailed content manifests, immutable source materialization, provider digests and pagination as design questions, not automatic prerequisites.

Acceptance: a real agent can inspect two scopes from one captured analysis, identify unavailable data, and see the source revision or dirty-state limitation. Compare total work and tokens with the baseline; no numerical improvement is assumed.

### Milestone 2 results (2026-11-04)

**Corpus.** srcly at `e169c3d` (1,373 tracked files, 540 ranked code files), in a detached worktree with the client's `node_modules` linked so `tsc` runs. plan-viewer at `a82aef1` (117 files, 44 code files, mostly plain JS). Each run used its own empty `SRCLY_CACHE_DIR`. A harness ran each command in-process and counted scans, checker runs, `git log` runs and child processes.

**Audit.** Repository → folder → file → symbol. srcly: `.` → `server/app/services` → `typescript/typescript_analysis.py` → `::_get_function_name`. plan-viewer: `.` → `public` → `public/app.js` → its CCN 33 `(anonymous)`. Latency is from a quiet machine on the old code. The new code adds one 0.02 s tree walk, timed directly. Later runs on a loaded machine were up to 2x slower on both code paths.

| Step | srcly wall | plan-viewer wall | Scans | Checkers | `git log` | Child processes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First `explain` (cold) | 5.1 s | 1.6 s | 1 | 4 / 2 | 1 | 23 / 21 |
| Each later `explain` step | 1.06–1.11 s | 0.53–0.55 s | 0 | 0 | 0 | 8 |
| `report --out` cold | 5.9 s | 1.7 s | 1 | 4 / 2 | 1 | 23 / 21 |
| `report --out` warm | 1.8 s | 0.6 s | 0 | 0 | 0 | 8 |
| After a one-line edit | 4.9 s | | 1 | 4 | 0 | |
| After reverting it | 5.5 s | | 1 | 4 | 0 | |

A warm srcly step spends about 0.35 s starting Python, 0.07 s on the fingerprint, and about 0.6 s parsing the cached tree (2 MB gzip, 47 MB JSON). The 8 child processes are git: the file listing for the fingerprint, `HEAD`, and the dirty check. Cold time is the checkers: they take 4.1 s beside a 2.5 s scan. `report` and `explain` share one cache entry, so a `report` makes every later `explain` warm.

| Output to an agent | srcly before → after | plan-viewer before → after |
| --- | ---: | ---: |
| `explain` walk, 4 steps | 9.9 KB → 11.1 KB | 5.0 KB → 5.8 KB |
| `report --out` stdout | 0.5 KB → 1.9 KB | 0.5 KB → 1.3 KB |
| `report` artifacts | 237 KB | 221 KB |
| `report --stdout` | 202 KB | 191 KB |

`report` alone has no file or symbol scope. Reaching the same symbol from artifacts means reading `report.md`, `tree.summary.json` and `hotspots.json`: about 118 KB for srcly. The mixed walk now costs 4.7 KB in three calls and one scan: `report`, then `explain` on the printed file, then on its symbol. The 1.2 KB the `explain` walk gained is the `Analysis:` line, about 300 B a step.

**Freshness and coverage, before this milestone.**

- `report.md` showed the Git HEAD, uncommitted files and each checker. `manifest.json` said `"cache_used": false` on every run, including reused ones.
- `explain` showed none of it. It did not say whether it reused a scan, which HEAD the history came from, that files were uncommitted, or what the checkers covered. It listed `finding_count` as N/A per file with no reason.
- Neither command counted code files that no checker covers: 26 of 44 in plan-viewer, because no eslint covers its `.js` files.

**Decision: the fingerprinted cache is enough; no snapshot artifact.**

- Warm steps already make no provider calls.
- A snapshot would hold the same tree, so it would cost the same parse. It would save only the 0.07 s fingerprint and would lose the guarantee that an answer matches the files on disk.
- The cost that matters is the invalidation unit, which a snapshot does not change. Any edit to a tracked file rescans everything and reruns every checker. A revert does the same, because each root keeps one entry. Reuse per file is a milestone 3 or 4 question, and only if edit-and-recheck audits need it.
- The gap was visibility, so this milestone builds that.

**Built.**

- `explain` and `report` end with one `Analysis:` line. It gives the reused or fresh scan with its time, the Git HEAD, the uncommitted-files note, each checker with its file count, how many code files no checker covers, and files that failed analysis. `explain --format json` carries it as `analysis`, and `manifest.json` carries it too. `cache_used` is now true when the scan was reused.
- Same-named symbols: the walk on plan-viewer found a wrong answer. `public/app.js` has 149 `(anonymous)` functions. Its file table pointed at the CCN 33 one at line 2988, but `--at 'public/app.js::(anonymous)'` returned the one at line 73 with no warning. The table now gives `file::name@line`, and a bare ambiguous name lists each match, most complex first.
- `report` prints its top 5 high and medium findings, the `Analysis:` line and a `Next:` explain command for the first finding. Of the three follow-ups the clean-room audits asked for, this one had the clearest value: it removes the first artifact read (7 KB of `report.md`) from every audit and needs no new data.

**Invalidation limits.** The cache key is the resolved root path. A subfolder or another worktree analyzed as its own root is a separate full scan. The fingerprint is path, mtime and size over the git listing, so a `touch` rescans but a result is never stale. Checker results share the fingerprint, and Git activity is keyed by HEAD and window. A checkout reports its version as `dev`, so a change to the stored tree's shape must bump `CACHE_FORMAT`. The cache keeps 20 entries on disk.

**Still not visible.** Which code files no checker covers, and why (only a count). Which files failed analysis (only a count). A content identity for the scan (only its time). `report.md` does not say whether the scan was reused; stdout and `manifest.json` do.

**Found on the corpus.**

- Lizard misreads plain JS. In plan-viewer `public/code.js` it folds lines 99–1430 into the one-line `bytes` helper (CCN 584). srcly's tree-sitter analyzer reads the file's worst function as `renderDiff` (CCN 86). Fixed in the next layer: JS now goes through the tree-sitter analyzer (`server/tests/test_js_analysis.py` keeps the repro).
- `findings.json` puts an absolute path in `complexity_witness.path`; every other path is relative to the root.

**Moved to milestone 3.**

- Link findings to tests. `explain` on a file could list the test files that import it, labeled as imports, not proof of coverage (see section 4). The dependency graph covers TS and TSX only, and building it on every call has not been measured. Measure that cost first, and add Python imports.
- Tell flat dispatch from tangled control flow. plan-viewer's `server.ts::handleRequest` (CCN 196, nesting 4) is a flat router. srcly's `viewModel.ts::buildViewModel` (CCN 135, nesting 5) is not. CCN alone ranks them alike. A signal needs a measured metric in both tree-sitter analyzers (for example, branches at the function's own top level against nested branches), added through `docs/adding-a-metric.md` with fixture cases. Do this before it changes any ranking.
- Name the code files that no checker covers, with their reason, in `explain` for a folder.
- Make `complexity_witness.path` in `findings.json` relative.

## 3. Deliver scoped investigation

Use the prototype to choose a coherent command surface. Provide folder rollups and file/symbol detail with located witnesses, deterministic ordering and bounded output. Show actual checker diagnostics separately from metrics and retain their coverage. Separate application code, docs, fixtures and generated files with visible reasons; avoid hiding them. Replace generic advice and peer-relative severity only after an evaluated alternative answers the same jobs. Preserve the single-metric ranking and witnesses until replacement paths work.

Tests should cover measured zero versus unavailable, tied rankings, duplicate symbol names, long paths, omitted counts, partial scans and folder descendants. A real audit should reach source and relevant tests without loading every artifact.

## 4. Add evidence on demand

Add imports, related tests, history and native dataflow only where a scoped question needs them. Label relationships and limitations; an import is not proof that a test exercises a behavior. Preserve dataflow outcomes, assumptions, frontiers and generation semantics. Measure provider cost and freshness before adding a persistent service. Compare before/after evidence with explicit coverage changes and a separate diagnostic gate only when matching and completeness support it.

## 5. Evaluate and document

Compare baseline, repaired CLI and the chosen workflow on frozen representative repositories and defined refactor-audit tasks. Measure task completion, unsupported claims, coverage recognition, provider calls, total consumed output and cold/warm time. Record failures and unavailable corpus inputs. Update `README.md`, `docs/CODE_MAP.md` if main files move, and `skills/srcly-code-quality/SKILL.md`; run the affected checks and installed-wheel smoke test when packaging changes.

The Pro proposal includes 36 recommendations and eight detailed milestones. Its [disposition register](../../research/agent-reporting-2026-10/dispositions.md) records how this plan treats each group. The plan is a direction for review, not approval to ship a new CLI contract.
