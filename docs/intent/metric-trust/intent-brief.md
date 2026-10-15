# Trustworthy metrics and ranking

## My read

Byron wants Srcly to reveal useful code quality information with little duplicated evidence. That starts with measurements whose meaning remains clear across files, functions, folders, reports, and the explorer. More metrics cannot help when a missing value looks healthy or a displayed function is actually a markup container.

This initiative gives the existing measurements a dependable meaning. A reviewer should see what was measured, where it came from, and which source unit produced a maximum. A failed or unsupported analysis must remain visible. Counts that describe code should not imply a defect without evidence.

The main user is a developer exploring a local repository. The headless report must serve the same review decision as the browser. It should not assign a different priority merely because its scoring path uses another denominator. These improvements should keep Srcly useful before any history, coverage, clone, or semantic analyzer integration exists.

## What matters most

- Separate real executable functions from containers and display fragments.
- Distinguish measured zero from unavailable or partial analysis.
- Use explicit units, comparison populations, and source locations.
- Stop repeated evidence from receiving extra priority through combined scores.

## Boundaries

Fix the current contract directly. Assume one client and server version. Do not introduce compatibility adapters, a general schema platform, or a replacement analyzer engine.

Only add extraction or rollups that support a useful decision. Some TS counters can remain file-only diagnostics. Reproduce suspected source-area and navigation errors before treating them as confirmed product defects.

Do not add a universal health score. Preserve useful counters as neutral detail when their quality interpretation is weak. Permanent catalog reduction belongs to the portfolio evaluation.

## What seems settled

The baseline has separate maximum and average complexity fields. Keep that distinction and correct stale documentation. Ten TS counters do not reach folders. Report ranking omits zero-valued metrics from its weight denominator. These source findings justify focused correctness work.

Display area, physical lines, nonblank lines, and code lines can serve different purposes. Their labels and ownership rules must make those differences explicit.

## Next step after confirmation

Start with one scan fixture that contains real functions, display scopes, a genuine zero, and unavailable analysis. Carry it through API, report, and explorer before broadening coverage. The [shape](shape-brief.md) and [plan](implementation-plan.md) describe the proposed proof sequence. All implementation remains planned.
