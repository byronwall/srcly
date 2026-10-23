# Custom metrics and repository settings — shape

**Outcome:** Developers use Srcly's views with private measurements and repeatable repository settings.

**Primary flow:** Generate results → select an import in repo config → scan → choose a metric → inspect source evidence.

## Feature scope

```text
Custom results and repo policy
├── PLANNED FIRST RELEASE
│   ├── Native result import
│   │   ├── File measurements with units, meaning, and sum/max/no rollup
│   │   ├── Separate diagnostics with producer, rule, and optional lines
│   │   └── Matched, stale, missing, and partial result status
│   ├── Existing views and reports
│   │   ├── Metric picker, Explorer, Hot Spots, colors, and code viewer
│   │   └── Raw observations and separate diagnostic export
│   └── Repository settings
│       ├── One selected srcly.toml or equivalent tool.srcly policy
│       ├── Defaults, exclusions, check mode, and selected resource limits
│       ├── Color stops, risk thresholds, and named quadrant cutoffs
│       └── Effective settings inspector and Reload results
├── PLANNED FOLLOW-ON
│   ├── One saved diagnostics format, default SARIF
│   └── Explicit local check commands using the same result contract
└── EVALUATE LATER
    ├── Named scoring profiles and explicit CI gates
    ├── Portable result snapshots and comparison
    └── Coverage and graph evidence with their own data shapes
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Producer measures zero | Keep zero in values, ranking, and completeness. |
| Eligible file has no result | Show unknown with a reason. |
| Two of three eligible files are measured | Label the folder value as partial, with 2/3 measured. |
| Source differs from the artifact | Retain inspectable output; withhold current ranking and line marks. |
| Import is missing | Keep source exploration usable and explain the unavailable metric. |
| Explicit report requests an unavailable metric | Return a clear error; do not select another metric silently. |
| User changes color stops | Update colors; retain raw values and source analysis. |
| User reloads results | Read artifacts without running checks. |
| Config declares a command | Run only after an explicit CLI or UI action. |

## Examples

Proposed minimal config; these keys do not exist yet:

```toml
version = 1
[checks]
mode = "off"
[[imports]]
id = "team-review"
path = ".srcly/results/team-review.json"
expected_metrics = ["acme.review/debt_count"]
[defaults]
metric = "acme.review/debt_count"
view = "treemap"
[metrics."acme.review/debt_count"]
color_stops = [0, 1, 5]
```

The producer supplies the metric definition and file values. Config supplies its display scale. Diagnostic records use a separate section, so one warning need not equal the measurement count.

## Decisions and boundaries

**Appetite:** First deliver dependable file imports and useful repo settings. Release them before command execution or adapter work.

**Key decision:** Use a file contract instead of an in-process plugin. This lets the coworker keep their own toolchain. Adapters and later commands feed the same consumer path.

**Policy:** Discover one policy at the Git worktree root. Preserve narrow scan scope. Resolve config paths from the config directory. Allow explicit config selection; do not merge nested policies. Explicit operation values override repo values. Personal view choices do not alter reports.

**Boundary:** The first proof uses one file-local producer and plain tracked UTF-8 files. Extend to dirty and non-Git source next. Defer custom profile scoring and CI gates until raw imports and thresholds work. Existing built-in profiles keep their current method.

**Reuse:** Keep fixed built-in metrics and their checks. Add a small typed custom-value boundary. Reuse the code viewer and findings presentation. The earlier evidence initiative consumes this shared path for diagnostics.

**Bypass:** Omit imports or explicitly disable config/results/checks. Source analysis stays usable. A failed reload keeps prior results visibly stale.

**First proof:** A three-file import reaches both views and reports.

**Try:** Import `a.ts=2`, `b.ts=0`, and unknown `c.ts`, plus one diagnostic at `a.ts:2`.

**Observe:** Correct ordering, units, line navigation, raw export, and a folder subtotal of `2` with `2/3` measured.

**Decide:** Continue only if zero stays measured, unknown stays unknown, and tree values match the effective catalog. Otherwise repair that boundary first.

See the [implementation plan](implementation-plan.md) and [research summary](../../research/extensibility-config-2026-10-22/README.md).
