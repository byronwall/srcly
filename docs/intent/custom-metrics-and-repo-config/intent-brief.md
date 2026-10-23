# Custom metrics and repository settings

## My read

Srcly should let developers explore their own measurements through its existing views. A coworker likes the visualization and user experience, but needs different metrics. The desired result is a useful way to bring those measurements into Srcly without maintaining a fork. The way to achieve that result remains open.

The same developer should be able to keep useful settings with a repository. Those settings could define limits, thresholds, and defaults that match the project. A shared config should make repeated use predictable. The research must decide which settings belong there and how they affect the CLI, reports, and browser.

These two needs are related. Custom measurements need definitions and interpretation. Repository settings need a clear place to name those definitions and choose defaults. They do not require one large framework. The first release should prove a small workflow that a developer can use with their own data.

Byron requested Pro research before shaping this work. The research will compare alternatives, inspect the current source, and propose a buildable route. This brief records the request while that work runs. It does not select a plugin model, file format, or execution policy.

## What matters most

- Reuse Srcly's views for developer-supplied measurements and checks.
- Keep desired limits, thresholds, and defaults with the repository.
- Explain how supplied values map to files and source evidence.
- Choose a route that a personal developer can build and maintain.

## Expected experience

A developer supplies results, or connects a way to produce them. Srcly makes the supported measurements available in its views. The developer can inspect their meaning and supporting evidence. Repository settings provide repeatable defaults. The research must show one concrete workflow from input to visible result and headless report.

## Boundaries

This request authorizes research and a new initiative. It does not authorize application implementation. Missing measurements must remain distinct from measured zero. Existing metric values must retain their meaning when settings change their interpretation.

The implementation should fit the current local tool. Avoid adding services, version coexistence, or broad extension machinery without a concrete need. A source packet supplies the exact research baseline. Current primary sources should support external comparisons.

## Possibilities, not decisions

Imported results, overlays, command producers, and plugins are candidate mechanisms. A dedicated config file and existing package configuration are candidate settings homes. None is selected yet. The request does not name a particular coworker format or require compatibility with every analyzer.

## Current reality

Srcly has a shared metric catalog, findings and Git activity overlays, fixed scan settings, and CLI options. The browser loads its catalog before rendering. Custom metric support must account for this flow and the server's fixed metric fields.

The older imported-quality-evidence initiative proposes specific evidence imports. Its no-plugin boundary reflects that earlier scope. The new research must explain reuse and overlap without changing that initiative silently.

## Next step

Collect Pro's report. Check decisive claims against the source. Then write the shape and proof-first plan here. Keep lifecycle status planned until implementation starts.
