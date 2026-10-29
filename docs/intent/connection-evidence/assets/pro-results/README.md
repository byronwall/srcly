# Complete Pro results

These are the complete Pro deliverables for [PR #256](https://github.com/byronwall/srcly/pull/256).
Byron requested that all result materials be preserved as assets of this intent entry.
[Reviewed implementation plan](../../implementation-plan.md) · [Source conversation](https://chatgpt.com/c/6ae2a1fc-1100-83e9-a8de-39abe701f030)

The original content and archive paths are unchanged. Recommendations remain research proposals.
The pinned research baseline is `ee8a771ce94fb59573492445d0f5fa2411ad83c8`; the reviewed plan reconciles later code.
Downloaded experiment code is preserved for inspection. It was not executed during integration.

## Reports

| File | Contents |
| --- | --- |
| [research-report.md](research-report.md) | Synthesis, dependency taxonomy, architecture audit, and conclusions |
| [tool-survey.md](tool-survey.md) | Sixteen tools and seven detailed workflows |
| [ui-patterns.md](ui-patterns.md) | Alternatives, interaction rules, and mock states |
| [srcly-gap-map.json](srcly-gap-map.json) | Twelve gaps, evidence, and baseline backlog overlap |
| [evaluation-plan.md](evaluation-plan.md) | Fixtures, expected answers, measurements, and rejection gates |
| [recommendations.md](recommendations.md) | DA-001 through DA-012 |
| [handoff.md](handoff.md) | Pro's proposed first slice and evidence contract |
| [sources.md](sources.md) | Primary sources, provenance, claim mapping, and evidence limits |

## Figures and mockups

- IDE figures: [IntelliJ](assets/ide-ui/intellij-dataflow.png), [VS Code call hierarchy](assets/ide-ui/vscode-call-hierarchy.png), [VS Code peek](assets/ide-ui/vscode-peek.png), [Eclipse](assets/ide-ui/eclipse-call-hierarchy.png), [Visual Studio](assets/ide-ui/visualstudio-calls.png), [WebStorm](assets/ide-ui/webstorm-call-preview.png).
- Analysis-tool figures: [CodeQL](assets/evidence/codeql-multiple-paths.png), [Semgrep](assets/evidence/semgrep-cross-file-official.png), [Understand](assets/evidence/understand-dependency-browser.png).
- Historical Srcly captures: [TSX route](assets/evidence/srcly-tsx-r2-route.png), [TSX save](assets/evidence/srcly-tsx-r2-save.png), [Python folding](assets/evidence/srcly-python-r5-folded.png), [Python closure](assets/evidence/srcly-python-r6-closure.png).
- A1, connection inspector: [PNG](assets/mockups/alternative-a1.png) · [SVG](assets/mockups/alternative-a1.svg).
- B, producer-first: [PNG](assets/mockups/alternative-b.png) · [SVG](assets/mockups/alternative-b.svg).
- C, source-first: [PNG](assets/mockups/alternative-c.png) · [SVG](assets/mockups/alternative-c.svg).

Figures retain the attribution and evidence limits in [sources.md](sources.md).
Mockups are proposals, not screenshots of implemented features.

## Experiment and package companions

- [Projection experiment source](assets/experiments/projection-check.mjs)
- [Pro's experiment results](assets/experiments/projection-check-results.json)
- [Machine-readable source register](assets/source-register.json)
- [Original manifest](manifest.json), covering 30 files; excludes itself and the outer ZIP

All 31 extracted files match the ZIP. All 30 manifest entries passed byte-count and SHA-256 checks.
The original ZIP remains in ignored local storage. All 31 extracted result files are committed here.
