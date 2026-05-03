# Srcly Production Run Retrospective: Product Grid Management

Date: 2026-05-03
Repository analyzed: `/Users/byronwall/Projects/product-grid-mgmt`
Command used: `uvx srcly report . --out .srcly --format both`
Caller goal: find pressing code quality issues, with special focus on violations of the repository's `AGENTS.md` guidance.

## Executive Summary

Srcly was useful in this first production run. It quickly identified the same broad risk areas that a human reviewer would likely prioritize after scanning the repository: very large TSX surfaces, especially the spatial-map module; legacy action/form transport patterns; and concentrated complexity in a few files and functions. The generated report gave the agent a good starting queue and prevented an unfocused repository-wide search.

The strongest value was triage. Srcly did not produce final answers by itself, but it reduced the search space from 404 scanned source files to a handful of credible inspection targets. The top Product Grid app findings were directionally correct: `SpatialMapScene.tsx`, `DesignSystemOverview.tsx`, `SpatialMapImages.tsx`, `SpatialMapInspector.tsx`, and `SpatialMapGridView.tsx` are all far beyond that repo's `200-300` LOC guidance and are plausible maintenance hotspots. The TSX metrics also pointed toward high render-branching and import-surface complexity, which matched the manual follow-up.

The tool was only moderately token efficient in actual agent use. The compact `report.md` was good and small enough to read directly, but the default artifact set produced about 120 KB of files, and `findings.json` was around 42 KB. The agent still needed shell filtering and direct source inspection to connect generic metric findings to repository-specific rules. The CLI also printed a very long progress log to the terminal, which is operationally useful for humans but noisy for agent contexts.

The biggest improvement opportunity is making Srcly produce more actionable, policy-aware, and consumption-aware guidance. The Product Grid run needed an answer framed around `AGENTS.md`. Srcly surfaced raw hotspots, but it did not know which local conventions were important, which findings matched them, which findings were likely irrelevant, or which searches should be run next. A next version should let callers provide a policy document or named rule set and should generate a "policy alignment" section alongside the metric hotspots.

## What Happened

The first sandboxed command failed:

```bash
uvx srcly report . --out .srcly --format both
```

Failure:

```text
error: failed to open file `/Users/byronwall/.cache/uv/sdists-v9/.git`: Operation not permitted (os error 1)
```

The command succeeded after escalation because `uvx` needed access to its cache outside the workspace sandbox. This is expected for some Codex environments, but it affects first-run ergonomics. For agent workflows, install/cache behavior should be called out explicitly.

Successful run facts:

- Srcly scanned 404 source files.
- It produced 50 ranked hotspots/findings.
- It classified 0 findings as high and 10 as medium.
- It wrote `.srcly/manifest.json`, `tree.summary.json`, `hotspots.json`, `findings.json`, `metrics.schema.json`, `report.md`, and `agent-skill.md`.
- The compact human report was about 6.8 KB.
- The default artifact set was about 120 KB total:
  - `report.md`: 6,826 bytes.
  - `findings.json`: 41,795 bytes.
  - `tree.summary.json`: 14,203 bytes.
  - `hotspots.json`: 49,590 bytes.
  - `metrics.schema.json`: 6,106 bytes.
  - `agent-skill.md`: 1,406 bytes.

The initial Srcly top targets included:

- `.agents/skills/image-to-code/SKILL.md`, a very large Markdown node.
- `app/src/components/spatial-map/SpatialMapScene.tsx`, a TSX hotspot with 2,051 LOC in the Srcly node, 47 parameter-count signal, 18 import-coupling count, and 31 render branches.
- `app/src/components/comps-explorer/DesignSystemOverview.tsx`, a very large TSX surface.
- `packages/cli/src/main.mjs::dispatchNode`, a complexity hotspot with complexity 52.
- `app/src/lib/projects/context-node-markdown.ts::parseMarkdownHeadingSections`, complexity 32 with nesting depth 5.
- `app/src/components/spatial-map/SpatialMapImages.tsx`, a TSX hotspot with 1,233 LOC in the Srcly node and 30 render branches.

The final human answer focused on three AGENTS-related issues:

- Legacy form-backed mutations and `useSubmission`/`normalizeActionUrl` still appeared in several UI paths.
- Large TSX files violated the repo guidance to keep newly created or substantially expanded files around 200-300 LOC.
- Client-side `fetch()` helpers under UI component modules were candidates for server-action/query migration.

The manual follow-up also checked spatial canvas safety rules and did not find a pressing violation there. The search found `filter: "none"` on spatial-map node elements but no `drop-shadow`, `blur`, `will-change`, or `translateZ(0)` inside the scaled spatial-map canvas.

## Utility Assessment

### What Srcly Did Well

#### It reduced the search space quickly

The repository had 404 scanned source files. Without Srcly, the agent would have started with broad `rg` searches and file-size heuristics. Srcly immediately gave a ranked list, with metric evidence, that made the first inspection pass much faster.

This mattered because the user asked for "pressing issues" rather than a complete audit. Srcly's ranking was good enough to choose a practical top 3-5. The agent did not need to inspect every route, component, package, and doc.

#### It correctly identified large TSX surfaces as important

The Product Grid `AGENTS.md` explicitly says to aim for roughly `200-300` LOC per file and to proactively refactor before a file grows beyond that range. Srcly's TSX and size hotspots directly surfaced violations of that guidance.

Manual `wc -l` confirmed the risk was not a metric artifact:

- `SpatialMapScene.tsx`: 2,171 lines.
- `SpatialMapImages.tsx`: 1,324 lines.
- `SpatialMapInspector.tsx`: 1,267 lines.
- `SpatialMapGridView.tsx`: 1,333 lines.
- `DesignSystemOverview.tsx`: 2,247 lines.

This is exactly the type of signal Srcly should produce for agentic refactor planning: not "this is a bug", but "start here; this file is probably carrying too much responsibility."

#### The TSX-specific evidence was more useful than LOC alone

`SpatialMapScene.tsx` was not just large. Srcly reported render branching, import coupling, parameter count, and nesting. That changed the interpretation from "large file" to "large UI state/render surface." That is more actionable.

The same was true for `SpatialMapImages.tsx`: LOC plus 30 render branches and high import coupling made it a better candidate for responsibility extraction than a plain line-count report would have.

#### The report format encouraged safe interpretation

The report and skill instructions correctly framed findings as triage signals rather than defects. That kept the agent from overclaiming. The final response used language like "risk", "candidate", and "next action" rather than "bug."

That is a good default for static analysis in agent workflows. It reduces false-positive harm and makes the tool more trustworthy.

#### The compact report was small enough to read

At about 6.8 KB, `.srcly/report.md` was token efficient. It included the summary, top target table, and a compact tree summary. It was small enough to load in one tool call and provided enough context to begin follow-up inspection.

For agents, this file is the right entry point.

### Where Srcly Was Less Useful

#### The highest-ranked finding was not relevant to the user's intent

The top finding was `.agents/skills/image-to-code/SKILL.md`, a large skill Markdown file. It was a real size signal, but it was not relevant to "pressing issues in this repo" with focus on app `AGENTS.md` guidance.

This caused two problems:

- The top of the report looked less product-relevant than the rest of the list.
- The agent had to mentally filter out local agent-skill documentation before reaching application code.

This is a ranking/context problem, not an analyzer failure. Srcly did not know that `.agents/skills/` was lower-priority for this request. But in agent workflows, this kind of path-priority mismatch is common.

Recommended improvements:

- Add a `--focus` or `--path-priority` option so callers can bias findings toward `app/src`, `packages/*/src`, or other production paths.
- Add a default deprioritization rule for `.agents/`, generated docs, vendored examples, snapshots, and maybe `docs/idea/` unless the caller asks for documentation analysis.
- Let report ranking separate "product code", "tooling/CLI", "docs", and "agent instructions" rather than mixing all nodes into one list.

#### Srcly did not connect findings to local policy

The user specifically asked for issues against `AGENTS.md`. Srcly did not read or incorporate that file. The agent had to run additional searches for:

- `fetch(`
- `<form`
- `method="post"`
- `useSubmission`
- `useSubmissions`
- `normalizeActionUrl`
- `filter:`
- `drop-shadow`
- `blur(`
- `will-change`
- `translateZ(0)`
- `createResource`
- `resource.latest`

Those searches were necessary because the real question was not just "where is the code complex?" It was "where does code quality diverge from local conventions?"

Recommended improvements:

- Add `--policy AGENTS.md` or `--conventions AGENTS.md` support.
- Generate a `policy-findings.md` artifact with detected rule matches.
- Include a "Suggested follow-up searches" section derived from recognized policy terms.
- Support repo-local rule packs, for example:
  - `avoid_use_submission`
  - `avoid_form_post_actions`
  - `avoid_ui_fetch`
  - `prefer_resource_latest`
  - `avoid_spatial_canvas_filters`
  - `avoid_generated_dir_edits`

Even a simple keyword/rule extraction pass would have improved this run substantially.

#### The findings were too generic for direct action

Many suggested actions were variants of:

```text
Look for separable responsibilities and tests that protect behavior.
```

That is true, but too broad. In the Product Grid run, the next action needed to be more concrete:

- For oversized TSX spatial-map components: split action transport, canvas node rendering, image upload/viewer state, and inspector metadata/context panels.
- For form-backed mutations: migrate highest-traffic actions to `useAction(...)`, keep explicit pending/error state, and use typed object inputs where framework constraints allow.
- For direct client `fetch()`: classify long-running job/SSE flows separately from ordinary data reads/writes.

Recommended improvements:

- Generate action templates based on finding category and file type.
- For TSX hotspots, name likely extraction axes:
  - render-only child components
  - action/mutation hooks
  - derived memo/selectors
  - event handlers
  - style primitives
  - modal/dialog subtrees
- For route/action hotspots, call out transport patterns and state patterns.
- For large Markdown/docs, suggest split-by-heading only when docs are inside source-critical paths or referenced by tooling.

#### The CLI progress output was noisy in agent context

The successful command printed hundreds of progress lines:

```text
➡️ [1/404] Starting analysis: ...
✅ [1/404] Analyzed ...
```

This is useful for humans running an interactive scan, but it is expensive and distracting in an agent transcript. The important information was the final artifact list and summary.

Recommended improvements:

- Add `--quiet` or make `report` quieter by default.
- Emit one-line progress every N files or every few seconds.
- Preserve detailed progress behind `--verbose`.
- For agent-friendly mode, print only:
  - root path
  - number of files
  - elapsed time
  - artifact paths
  - summary counts
  - next recommended file to read

#### The default artifact set is larger than the entry-point story implies

The docs correctly tell agents to read `report.md` first. That worked. But `--format both` plus default artifacts produced about 120 KB. The two largest files were `hotspots.json` and `findings.json`.

This is not a problem if agents follow the skill exactly. It is a problem if an agent loads all generated files or if a workflow automatically attaches the whole `.srcly` directory.

Recommended improvements:

- Add `--agent-compact` mode that writes only:
  - `report.md`
  - compact top-N `findings.json`
  - `manifest.json`
  - optionally `metrics.schema.json`
- Add `--limit-findings N` and `--limit-hotspots N` to bound artifact sizes.
- Add byte-size summaries to the command output so agents can choose what to read.
- Put "Do not load everything" directly in `report.md`, not only in the generated skill.

#### Medium/low severity did not reflect caller urgency

Srcly reported 0 high and 10 medium. That is probably defensible under generic code-quality scoring. But from the Product Grid repo's local guidance, 2,000-line TSX files and widespread legacy form-action transport are pressing because they directly contradict the repository's current engineering direction.

This exposes a distinction:

- Generic static-analysis severity: "How likely is this to be risky in any codebase?"
- Policy-alignment severity: "How much does this conflict with this repo's stated rules?"

Recommended improvements:

- Add a separate `policy_priority` or `alignment_priority`.
- Let local policy matches promote findings.
- Show both generic priority and policy priority in the report.

#### Srcly did not identify absence-of-risk cases

The final answer included a useful negative finding: spatial canvas safety looked okay. That mattered because the Product Grid `AGENTS.md` includes a specific warning about canvas filters and forced compositing.

Srcly did not help prove this negative. The agent had to run `rg` searches for filter/compositing patterns.

Recommended improvements:

- For policy checks, include "checked and not found" rows.
- Produce a `policy-checks.json` with:
  - rule id
  - search pattern or analyzer
  - matches
  - status: `pass`, `warn`, `fail`, or `manual_review`
- In `report.md`, include a short "No-match checks" section for high-risk local rules.

## Token Efficiency

### What Was Efficient

The workflow was efficient when using the intended entry point:

1. Run `uvx srcly report . --out .srcly --format both`.
2. Read `.srcly/report.md`.
3. Read only top entries in `.srcly/findings.json`.
4. Inspect matching source files directly.
5. Use `rg` for policy-specific follow-up.

The report was compact and immediately useful. The top targets table was enough to start inspecting. The summary stated there were 50 findings, 0 high, and 10 medium. The metric evidence in the table reduced the need to open `hotspots.json` at all.

### What Was Not Efficient

The command output itself was too verbose for a chat-based agent. It returned a large amount of progress logging before the final artifact summary. That output consumed attention without affecting the decision.

The generated artifacts were reasonable for disk use but not inherently token-safe. The default set was about 120 KB. If the agent had opened all artifacts wholesale, the run would have become inefficient quickly.

`findings.json` was useful but had redundant boilerplate in each entry:

- Similar `agent_prompt` text repeated across findings.
- Similar `suggested_action` text repeated across categories.
- Long absolute paths repeated.

This is machine-friendly but not token-minimal. Agents benefit more from a compact top-N view and a separate schema/dictionary for repeated text.

### Token Efficiency Grade

Overall grade: B-

Rationale:

- `report.md` was excellent as a compact entry point.
- The skill instructions prevented the agent from loading too much.
- The terminal progress output was noisy.
- The default JSON artifacts were larger and more repetitive than necessary.
- The tool still required manual policy searches, which added extra tool calls and source reads.

## Guidance Quality

### Good Guidance

Srcly's guidance was good at the "where to look" layer:

- It identified credible hotspots.
- It attached metric evidence.
- It avoided claiming defects.
- It suggested behavior-preserving inspection.
- It made clear that source/tests should be read before edits.

This is the right baseline for a first production tool.

### Weak Guidance

The guidance was weaker at the "what should I do next in this repo" layer:

- It did not know local rules.
- It did not separate production code from docs and agent-skill files.
- It did not name concrete extraction opportunities inside large TSX files.
- It did not detect migration patterns like `useSubmission` to `useAction`.
- It did not provide a policy-aligned severity model.

For agentic workflows, the most valuable next step is not just ranking complexity. It is turning complexity into a scoped, reviewable work queue.

## Recommended Product Improvements

### P0: Add Policy-Aware Reporting

Add support for:

```bash
uvx srcly report . --out .srcly --policy AGENTS.md
```

Minimum viable behavior:

- Read the policy file.
- Extract high-signal rule phrases and code identifiers.
- Run literal and regex-based checks for referenced APIs/patterns.
- Produce a policy alignment section in `report.md`.
- Produce `policy-findings.json`.

For Product Grid, this would ideally have surfaced:

- `useSubmission` usage despite guidance to prefer `useAction`.
- `<form method="post">` action transport despite migration guidance.
- `normalizeActionUrl(...)` usage in UI code despite guidance to avoid new usage.
- Direct `fetch()` in component-adjacent app-data helpers.
- Oversized TSX components against the 200-300 LOC guidance.
- Spatial canvas filter/compositing checks, including a pass when prohibited patterns are absent.

Implementation note: this does not need LLM interpretation initially. Start with deterministic policy detectors and a small built-in rule catalog. Later, add optional semantic policy summarization.

### P0: Add Agent-Quiet Mode

Add:

```bash
uvx srcly report . --out .srcly --format both --quiet
```

or make quiet behavior the default for `report`.

Desired output:

```text
Scanned 404 files in 19.3s.
Findings: 50 total, 0 high, 10 medium.
Wrote .srcly/report.md, .srcly/findings.json, .srcly/tree.summary.json.
Read first: .srcly/report.md
```

Detailed per-file progress should move behind `--verbose`.

### P0: Add Path Priority and Exclusion Controls for Reports

Add options such as:

```bash
uvx srcly report . --focus app/src --deprioritize .agents,docs/idea
uvx srcly report . --production-code-only
uvx srcly report . --exclude-doc-hotspots
```

The goal is not to hide files from the scan. The goal is to rank the report according to caller intent.

Default report grouping should separate:

- Production source.
- Tests.
- CLI/tooling.
- Docs.
- Agent instructions/skills.
- Generated or vendored files.

Product Grid's top report would have been stronger if `.agents/skills/image-to-code/SKILL.md` and `docs/idea/INDEX.html` had been grouped below production app findings.

### P1: Make Findings More Specific

Replace generic suggested actions with file/category-aware suggestions.

For TSX files:

- Report likely extraction candidates:
  - repeated `<Show>`/`<For>` subtrees
  - forms/action transport
  - modal/dialog sections
  - render-only SVG node components
  - custom hooks candidates based on signal/memo clusters
- Suggest verification style:
  - targeted component tests if available
  - type-check
  - screenshot/browser verification only when UI behavior is visually risky

For route/action files:

- Detect action signatures.
- Detect `FormData` usage.
- Detect hidden form transport.
- Suggest typed object input migration when framework supports it.

For Markdown/doc hotspots:

- Mention whether the file appears operational, documentation-only, or agent-instruction.
- Avoid making docs the top "pressing code quality" result unless requested.

### P1: Produce an Agent Action Plan Artifact

Add `.srcly/action-plan.md` with a short, ordered queue:

```markdown
## Suggested Work Queue

1. Migrate legacy action transport in spatial-map components.
   Evidence: ...
   Files: ...
   Safe first patch: ...
   Verify: pnpm type-check, targeted smoke path.

2. Split SpatialMapScene by behavior responsibility.
   Evidence: ...
   First extraction: ...
   Verify: ...
```

This artifact should be concise but more action-oriented than `report.md`.

### P1: Add Artifact Size and Read Order Metadata

Update `manifest.json` and command output with:

- file size
- intended audience
- recommended read order
- whether artifact is safe to load fully
- top-N counts included

Example:

```json
{
  "artifacts": [
    {
      "path": ".srcly/report.md",
      "bytes": 6826,
      "read_order": 1,
      "agent_load": "full"
    },
    {
      "path": ".srcly/findings.json",
      "bytes": 41795,
      "read_order": 2,
      "agent_load": "top_n"
    }
  ]
}
```

### P1: Bound JSON Repetition

Reduce repetition in `findings.json` and `hotspots.json`:

- Use relative paths from the repository root.
- Replace repeated `agent_prompt` strings with prompt ids.
- Move category-level suggested actions into a dictionary.
- Include a compact `findings.top.json` with the top 10 or top 20 findings.
- Keep full detail available behind an explicit artifact or flag.

### P2: Add Rule Checks for Known Modern Frontend Patterns

Srcly can grow a set of non-framework-specific and framework-specific checks that are especially useful to agents:

- React/Solid/Vue component file size thresholds.
- TSX render branching and nested conditional density.
- Inline handler density.
- Form transport pattern detection.
- Client `fetch()` classification:
  - data read
  - mutation
  - file upload
  - event stream/polling
  - external API
- Server/client boundary hints.
- Generated directory detection.

These should be configurable, because Product Grid's rules are not universal.

### P2: Add Negative Checks

For policy-aware reports, include positive passes for high-risk rules. In this run, the spatial canvas safety check was valuable:

```text
Spatial map canvas filter/compositing check: pass
No drop-shadow, blur, will-change, or translateZ(0) found under app/src/components/spatial-map.
```

This helps avoid only reporting bad news and saves agents from doing manual proof-of-absence searches.

### P2: Improve Severity Modeling

Add multiple priority dimensions:

- `metric_priority`: generic Srcly score.
- `policy_priority`: severity against local guidance.
- `change_risk`: likely risk of modifying this area.
- `user_goal_relevance`: relevance when focus/path/policy is provided.

In Product Grid, `SpatialMapScene.tsx` should probably rank high for policy relevance because it violates file-size guidance and contains legacy action transport. The generic "medium" label undercommunicated its importance for the user's stated goal.

## Suggested Implementation Roadmap

### Iteration 1: Agent Ergonomics

Ship these first:

- `--quiet` for `report`.
- Artifact size metadata in `manifest.json`.
- Relative paths in report tables and JSON.
- `--limit-findings` and `--limit-hotspots`.
- A compact `findings.top.json`.

Why first: these are low-risk and directly improve token efficiency.

### Iteration 2: Report Relevance

Add:

- report grouping by source category.
- default deprioritization of `.agents/`, generated dirs, vendored dirs, and docs unless requested.
- `--focus PATH` ranking boost.
- `--deprioritize PATHS`.

Why second: this would have prevented the largest relevance issue in the first production run.

### Iteration 3: Policy Alignment

Add:

- `--policy AGENTS.md`.
- deterministic pattern checks.
- `policy-findings.json`.
- policy section in `report.md`.
- negative/pass checks for explicitly recognized high-risk rules.

Why third: this makes Srcly useful for repo-specific agent work rather than just generic hotspot scanning.

### Iteration 4: Action Planning

Add:

- `.srcly/action-plan.md`.
- category-specific suggestions.
- TSX extraction hints.
- migration hints for common patterns.
- verification recommendations.

Why fourth: this turns Srcly from a triage tool into an agent work planner.

## Proposed Success Criteria

For a rerun on Product Grid, Srcly should be considered improved if:

- The top five production-code findings include the oversized spatial-map TSX files.
- `.agents/skills/image-to-code/SKILL.md` is not the first pressing issue unless docs/skills are explicitly in focus.
- The report explicitly flags `useSubmission`, `<form method="post">`, and `normalizeActionUrl(...)` as local policy-alignment issues when `--policy AGENTS.md` is provided.
- The report explicitly marks the spatial canvas filter/compositing check as pass or no-match.
- The default terminal output is under roughly 30 lines in quiet/agent mode.
- The recommended read path is clear and bounded.
- The agent can produce the final top 3-5 findings with fewer follow-up shell searches.

## Bottom Line

Srcly delivered real value in this first production run. It found useful hotspots, kept the review grounded in measurable evidence, and made the agent faster. The core analyzer and report shape are viable.

The next level of utility is context. Agents rarely need a generic list of complex files alone; they need a prioritized, local-rule-aware work queue. The Product Grid run showed that Srcly should keep the compact metric report, but add policy-aware checks, quieter output, path relevance controls, and more concrete action planning.

