# Custom metrics and repository settings

## My read

Developers should be able to use Srcly's views with their own measurements and checks. A coworker likes the visualization and user experience but needs different metrics. They should not need a Srcly fork to view those results. The outcome matters more than the extension mechanism.

Developers should also be able to keep useful settings with a repository. These settings include desired limits, thresholds, and defaults. Repeated scans should use an understandable policy. A narrow scan should keep its requested scope while using the repository's settings.

These needs fit one initiative. A custom measurement needs a name, unit, scope, and meaning. Repository settings tell Srcly how to display and interpret it. The producer owns the measurement. Repository policy owns interpretation. Changing a color scale must not change the stored value.

Byron requested Pro research before selecting the approach. That research now supports native result imports first. A developer can keep their analyzer in any language and supply its output. Explicit command execution can later use the same input contract. This is a recommendation from checked research, not a user commitment to a plugin format.

## What matters most

- Bring private metrics and checks into Srcly's existing views.
- Save repeatable settings with the repository.
- Preserve measured zero, unknown data, and source evidence.
- Keep the work small enough for a personal developer to maintain.

## Expected experience

A developer generates a result file and names it in repository config. Srcly loads it with the source scan. The developer selects a custom metric, reviews its files, and opens supporting evidence. Reports use the same definitions and values.

The developer can see which settings apply and why. Temporary view choices remain personal. A later explicit run action can execute a declared check. Reading config or reloading results does not start custom code.

## Boundaries

This work produces research and a plan. Application implementation has not started. Existing built-in metrics retain their current definitions.

Missing, stale, or failed results cannot become clean zero values. Partial folder values must show their completeness. Files outside the scan cannot widen it. Imported diagnostics remain separate from metric-derived report findings.

Use the existing local Python server and SolidJS client. Avoid a marketplace, remote service, in-process plugin API, or compatibility framework. External scope joins, coverage formulas, and graph imports need separate proofs.

## What seems settled

The first recommended slice is file-level native JSON with separate measurements and diagnostics. Use a dedicated `srcly.toml`; support equivalent `[tool.srcly]` settings later. Resolve one policy per scan. Keep units and aggregation in producer definitions.

The shared catalog and current overlays offer reuse. They do not yet support arbitrary measurements. Source association and scan-specific state need explicit work.

The older imported-quality-evidence initiative retains graph, clone, and coverage goals. This initiative owns the shared result contract and diagnostics import path. Neither requires the other's graph-first sequence.

## Next step after confirmation

Start the implementation plan's three-file proof when implementation is authorized. First show `2`, measured `0`, unknown, and one line diagnostic in the UI and report. This initiative remains planned.
