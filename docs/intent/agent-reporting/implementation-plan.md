# Agent reporting plan

Build a concise, evidence-first CLI for repository, folder, file and symbol investigation. Fix misleading results first. Then prove that saved analysis and scoped queries improve a real agent audit before committing to a larger contract. The [research summary](../../research/agent-reporting-2026-10/README.md) records the decision and review. The [original Pro materials](assets/pro-results/2026-10-31/INDEX.md) include detailed examples and a 100-case craft ledger.

## 1. Repair the current commands

Fix compare summaries in `server/app/services/compare/diff.py`: unavailable metrics must not become zero or produce a false improvement. Separate coverage changes from source additions and deletions; compare paired populations where appropriate. Represent missing graph coverage as unknown. Update client compare types and display if the API changes.

Route cache warnings in `findings/runner.py`, `activity.py` and other acquisition paths to stderr. Test JSON stdout with an actual failing cache boundary. Preserve zero and analysis status in compact evidence. Resolve `explain --file` against the requested root, validate limits, and make artifact references and refresh behavior truthful. Check whether truncation affects the existing gate before changing it. Tests should cover 12 → unavailable, unavailable → 12, mixed measured populations, failed graph coverage, cwd outside the target, zero/negative limits, and cache write failure. Update CLI documentation and the shipped skill. Ship these repairs without waiting for new commands.

## 2. Prove reusable analysis

Measure a complete repository → folder → file → symbol investigation on a fixed corpus against the current CLI. Record provider invocations, latency, output bytes and useful evidence. Prototype saving and reusing the existing analysis tree before designing a broad snapshot framework. Prove queries do not rescan and make source freshness and partial coverage visible. Keep paths relative to the scan root. Check whether a simple JSON artifact is sufficient and record invalidation limits. Treat detailed content manifests, immutable source materialization, provider digests and pagination as design questions, not automatic prerequisites.

Acceptance: a real agent can inspect two scopes from one captured analysis, identify unavailable data, and see the source revision or dirty-state limitation. Compare total work and tokens with the baseline; no numerical improvement is assumed.

## 3. Deliver scoped investigation

Use the prototype to choose a coherent command surface. Provide folder rollups and file/symbol detail with located witnesses, deterministic ordering and bounded output. Show actual checker diagnostics separately from metrics and retain their coverage. Separate application code, docs, fixtures and generated files with visible reasons; avoid hiding them. Replace generic advice and peer-relative severity only after an evaluated alternative answers the same jobs. Preserve the single-metric ranking and witnesses until replacement paths work.

Tests should cover measured zero versus unavailable, tied rankings, duplicate symbol names, long paths, omitted counts, partial scans and folder descendants. A real audit should reach source and relevant tests without loading every artifact.

## 4. Add evidence on demand

Add imports, related tests, history and native dataflow only where a scoped question needs them. Label relationships and limitations; an import is not proof that a test exercises a behavior. Preserve dataflow outcomes, assumptions, frontiers and generation semantics. Measure provider cost and freshness before adding a persistent service. Compare before/after evidence with explicit coverage changes and a separate diagnostic gate only when matching and completeness support it.

## 5. Evaluate and document

Compare baseline, repaired CLI and the chosen workflow on frozen representative repositories and defined refactor-audit tasks. Measure task completion, unsupported claims, coverage recognition, provider calls, total consumed output and cold/warm time. Record failures and unavailable corpus inputs. Update `README.md`, `docs/CODE_MAP.md` if main files move, and `skills/srcly-code-quality/SKILL.md`; run the affected checks and installed-wheel smoke test when packaging changes.

The Pro proposal includes 36 recommendations and eight detailed milestones. Its [disposition register](../../research/agent-reporting-2026-10/dispositions.md) records how this plan treats each group. The plan is a direction for review, not approval to ship a new CLI contract.
