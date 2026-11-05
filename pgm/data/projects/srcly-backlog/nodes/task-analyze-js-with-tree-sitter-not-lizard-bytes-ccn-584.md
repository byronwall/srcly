---
id: task-analyze-js-with-tree-sitter-not-lizard-bytes-ccn-584
label: Analyze JS with tree-sitter, not lizard (bytes CCN 584)
type: task
status: planned
priority: medium
parent: area-metrics-analyzers
rawContext: |
  
  ## Done when

  `srcly explain ~/Projects/plan-viewer --at public/code.js` lists `renderDiff` (not `bytes`) as the worst function, and a fixture test in `server/tests/` covers the two-line repro.
---
srcly sends `.js`, `.jsx`, `.mjs` and `.cjs` files to lizard 1.24.1. Lizard can lose the end of an arrow function with an expression body when the next line has nested template literals. The function then takes in every line up to a later closing brace.

## Evidence

`srcly explain ~/Projects/plan-viewer --at public/code.js` (plan-viewer `a82aef1`) reports `::bytes` at lines 99–1430, CCN 584, LOC 1136. `bytes` is one line. srcly's own tree-sitter analyzer (`TreeSitterAnalyzer`, TSX grammar) reads the same file as 318 scopes with a worst CCN of 86 (`renderDiff`, lines 2180–2232). Lizard reads 164 scopes.

Repro with lines 99–100 of that file only:

```js
const bytes = (size) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB` : size < 1073741824 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1073741824).toFixed(1)} GB`;
const when = (time) => `<time datetime="${new Date(time).toISOString()}" data-tip="${escapeHtml(new Date(time).toLocaleString())}">${ago(time)}</time>`;
```

`lizard.analyze_file.analyze_source_code("a.js", SRC)` gives `bytes` lines 1–2. Simpler single-template variants end correctly.

## Effect

A wrong worst-function CCN ranks a plain-JS file first in `report` and `hotspots`, and `explain` sends the agent to a one-line helper.

## Proposed fix

Analyze JS with the tree-sitter TSX grammar, as for `.tsx`. Add a `js` language in `server/app/services/analysis_types.py` (`MEASURED_FILE_METRICS` without `ts_*` metrics), `language_for_path` and `analyze_single_file` in `analysis.py`, `markers.py`, the catalog `languages` in `metric_catalog.py`, and the client mirror `client/src/utils/metricApplicability.ts`. Bump `CACHE_FORMAT` in `cache.py` so old trees rescan.

Found by agent-reporting milestone 2 (`docs/intent/agent-reporting/implementation-plan.md`); out of that PR's scope.

## Done when

`srcly explain ~/Projects/plan-viewer --at public/code.js` lists `renderDiff`, not `bytes`, as the worst function, and a test in `server/tests/` covers the two-line repro.

