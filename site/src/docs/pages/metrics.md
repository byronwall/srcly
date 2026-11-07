# Understand metrics

Use metrics to decide where to inspect, then check the code that produced the value. This guide explains common measurements, how folder values work, and what to do when a metric is unavailable.

## Read a metric in context

A metric has a scope and an aggregation rule. A function may have an exact measurement. A file or folder may sum values from children, take the maximum, or report an average. The UI and generated `metrics.schema.json` identify definitions and interpretation hints. Check those details before you compare two values.

Common measurements include:

| Metric | What it describes | How to use it |
| --- | --- | --- |
| LOC | Nonblank, noncomment lines of code | Find where code is concentrated; size alone is not a risk verdict. |
| Complexity (CCN) | Branching paths in a function | Inspect the function that sets a file or folder maximum. |
| Cognitive complexity | Branching and nesting effort under Sonar's rules | Compare functions with different nesting shapes. Available for TS, JS, and Python. |
| Function length, nesting, parameters | Code shape | Use as context for a review question, not as quality scores. |
| Component metrics | Detected React or Solid component structure | Inspect component LOC, hooks, effects, JSX depth, props, inline handlers, and conditionals. |
| Comment noise | Selected comment patterns | Check the flagged lines; this heuristic is not a style verdict. |
| Git activity | Commit count and churn in a selected history window | Add history to code structure when repository history is available. |

Other metrics include file size, imports, exports, TODOs, type signals, and language-specific measures. Detail metrics can provide context without being ranked as risk. See [Findings](../findings/) for checker results, which are separate evidence.

## Example: a maximum with a witness

Suppose three functions in a folder have CCN values 2, 4, and 8. The folder's complexity is 8 because the rule is maximum, not sum. Srcly names the function with CCN 8 as the witness. The value means “this is the most complex measured function in the folder”; it does not mean the folder has total complexity 8 or that the function is defective.

This example is illustrative. Use the displayed witness and metric definition for your actual scan. The witness gives you a source location to inspect. If the file or folder has no measured function for a metric, the result may be N/A instead of a numeric value.

## Distinguish zero from N/A

A measured zero is evidence that the metric applies and its measured value is zero. N/A means the metric does not apply, its analyzer did not measure it, or required data was unavailable. For example, component metrics do not apply to a file with no detected component. Git activity can be unavailable without suitable Git history. A checker metric can be unavailable when a required tool is missing or fails.

Srcly preserves this difference in the UI, reports, and comparisons. If a value is N/A, look for its reason. Do not turn it into zero when ranking or comparing. If the metric is important to your review, use [Configuration](../configuration/) to address supported setup gaps or accept that the scan cannot answer that question.

## Interpret comparisons carefully

Folder values aggregate children by the metric's rule. Complexity is a maximum and names its witness; LOC is a sum; other metrics may use maximum, average, or count. A single file's metric can change because its code changed, because measurement coverage changed, or because the measured population differs. `compare` keeps a metric unavailable on one side as `null` and reports measurement coverage changes separately from numeric deltas.

This prevents missing coverage from appearing as improvement. It also means two rows with similar values may have different evidence behind them. Read metric definitions, coverage, and witness before you draw a conclusion.

## Turn a signal into a review

1. State the question you want to answer.
2. Choose a metric whose definition matches that question.
3. Check the node type and aggregation rule.
4. Open the source or witness that contributed the value.
5. Confirm suspected problems with the source, tests, or the project's tools.

Metrics help you compare and focus attention. They do not measure correctness, security, or maintainability as one objective score. For per-metric rankings, use [Explore](../explore/); for the report schema and generated evidence, see [Reports](../reports/).
