# Value-flow basics

Fixtures for the value-flow ledger (`valueFlow` op). Each file is one case:

- `direct-property.tsx`: a prop read reaches a JSX text slot.
- `same-name-negative.tsx`: two bindings with a `name` field; only the selected one reaches its slot.
- `null-vs-finite.tsx`: `count ?? 0` keeps zero; `maybe!` is an assertion, not a check.
- `two-call-helper.tsx`: one helper called twice, whose body hands the value to an external method (`value.toUpperCase()`). The walk enters `shout` through its binding and ends at a dead end inside it; nothing joins the two calls.
- `two-call-identity-helper.tsx`: `id(x)` called twice (T13). A walk from `props.a` passes through `id`'s parameter and return and lands at its own call's slot, never the other's. A walk that starts inside `id` and leaves through its return still stops at a boundary: two calls could own it.
- `returns-other-argument.tsx`: `pick(a, b)` returns `b` (T13). A walk from the first argument enters `pick`'s `a`, which nothing reads: it ends there, never read, never at the slot.
- `destructured-props.tsx`: a component that destructures `{ viewer }`. A declaration anchor finds the read through the engine's `references` relation, not by matching `props.` in the source.
- `dead-end.tsx`: a value assigned to a local nothing reads ends there, never read (`ok`, its box says so); a value handed to an untyped callback ends at a dead-end frontier (`disconnected`), never quietly.
- `literal-start.tsx`: `const label = "x"` rendered. The backward walk ends at the literal, a natural start: no frontier, outcome `ok`.
- `closure-props.tsx` (rendered from `closure-props-host.tsx`): props read inside an arrow, a nested function and a handler. A declaration anchor on `Chip` binds `tone="warm"` and `count={2}` to their closure reads across files; a shadowed `props.tone` and `other.tone` never bind; `note`, never passed, stops at an `unbound-read` frontier.
- `half-landed.tsx`: a component whose `title` prop comes from a resource and whose `count` prop comes from `Math.random()`. A declaration anchor on `Pair` reads `partial`: one prop walk stops.
