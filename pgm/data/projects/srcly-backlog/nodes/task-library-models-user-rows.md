---
id: task-library-models-user-rows
label: "Library models: user rows"
type: task
status: planned
parent: area-data-flow-library-models-as-data
---
A repository adds rows for its own wrappers and internal libraries (a team `http()` client, a `useAppStore` hook), in the same format as `engine/models/*.json`.

- Location: a `[dataflow] models = [".srcly/models/*.json"]` section in the discovered `srcly.toml` (#100's plan, `docs/intent/custom-metrics-and-repo-config/`). Until that lands, `SRCLY_DATAFLOW_MODELS` (a path list) is enough for testing; it is not a documented feature.
- User rows load after the built-in ones and may override a built-in row with the same key. The session's status lists each override, so a proof can say "modelled by `.srcly/models/app.json`".
- A row naming a module or member the checker cannot resolve is reported, never ignored.
- The engine fingerprint must cover user rows, as it covers built-in ones.

Done when: a fixture repo with a user row traces through its wrapper as modelled, an override shows in the session status, and an unresolvable row is reported.

