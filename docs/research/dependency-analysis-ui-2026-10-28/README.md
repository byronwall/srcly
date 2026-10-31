# Dependency analysis and investigation UI

**Decision:** plan an “Explain connection” view in the existing inspector. Keep the graph as the primary surface.
Preserve the source relations behind each displayed edge before the engine or client combines them.
Treat this as a bounded improvement to evaluate, not an approved implementation or a new default view.

[Implementation plan](../../intent/connection-evidence/implementation-plan.md) · [Recommendation review](reconciliation.md) · [Original prompt](pro-prompt.md) · [Run record](run-record.md)

## What the research adds

Pro surveyed 16 products and services, with seven detailed workflows.
These include IntelliJ, VS Code, Eclipse, CodeQL, Semgrep, Joern, and Understand.
External evidence consists of official documentation, source, papers, and figures. Pro did not operate these products.

Three mechanisms matter most:

- **Inspectable groups:** Understand exposes the source references behind a dependency count. Preserve this property when combining Srcly relations.
- **Occurrence identity:** LSP call hierarchy keeps source ranges for grouped calls. A common target need not erase distinct occurrences.
- **Explicit path results:** CodeQL supplies a path graph for an explanation. An arbitrary walk through display boxes supplies a weaker guarantee.

These are design precedents, not measured Srcly usability gains.
Sources: [Understand](https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html), [LSP](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md), [CodeQL](https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/).

## Findings verified against current code

Integration inspected main at `47aa927` after the research baseline `ee8a771`.
The following source and projection findings still hold:

1. `AnchorGraphBuilder.pushEdge` keeps the first edge for each endpoint pair. Other relations can disappear before client inspection.
2. `anchorGraphToViewModel` combines endpoints again. It also removes references and keeps only the first proof location as display text.
3. Folded component boxes can connect otherwise disconnected internal members in the displayed graph.
4. `anchorsToViewModel` joins separate queries without preserving edge membership. Shared nodes alone do not certify one compatible invocation path.
5. `reachFrom` walks displayed adjacency. Its result cannot establish every composed source path.

Codex independently checked four cases with schema-valid synthetic inputs against the actual current projection modules.
They confirmed order-dependent edge selection, lost partial reference evidence, additional reach after folding, and additional reach after query union.
The folding case accounts for the newer component entry behavior in #273.
These checks establish projection behavior. They do not measure failures on real applications or prove incompatible call contexts.

The traversal already pairs calls. The concern is lost evidence and state when producing and combining graph results.
The proposed fan-out completeness defect remains an untested hypothesis; it is not a confirmed engine bug.

## What changed since the prompt

Main now has component folding and grouped route gaps (#273), branch labels (#257), and corrected action returns (#258).
It also gained callback parameter traversal (#260), handler pairing (#270), and receiver writes (#262, #271).
Framework models moved into data rows (#276). Do not reopen those completed tasks from the old gap map.
The evidence preservation problem remains after these changes. See [reconciliation](reconciliation.md) for active ownership.

## Direction and limits

Build the plan for local relation inspection, proof strength, source navigation, and Return.
Explore compatible path witnesses and scoped condition or receiver analysis separately.
Compare producer-first and source-first views only with equal evidence. Keep the present graph if alternatives do not improve correct answers.
Defer runtime tracing and import-inspector expansion. Avoid a replacement analysis platform or graph library for this first step.

The Thin Slicing paper motivates separate producer, condition, and identity questions.
Its statement-inspection reductions do not establish developer speedups. Its Java assumptions do not supply JavaScript guarantees.
[Original paper](https://manu.sridharan.net/files/pldi07.pdf).

Open questions concern payload cost, useful member grouping, and whether the inspector improves explanation accuracy.
General guard-to-write facts and same-object identity remain separate analysis requirements.
Missing condition evidence must read “not analyzed.”

## Research record

[Pro conversation and downloadable reports](https://chatgpt.com/c/6ae2a1fc-1100-83e9-a8de-39abe701f030).
All eight requested companions were collected and reviewed. No follow-up was needed.
[All original Pro materials](../../intent/connection-evidence/assets/pro-results/README.md) are committed as assets of the intent entry.
They include all extracted reports, figures, mockups, experiment files, source register, and manifest. The ZIP remains local.
Byron requested the complete result package in the PR after the initial summary integration.

No application implementation, browser test, benchmark, or user comparison was performed during integration.
Assistant-generated research and derivatives are excluded from substantive-activity ranking and independent product demand.
