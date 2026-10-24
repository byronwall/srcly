# Value-flow basics

Fixtures for the value-flow ledger (`valueFlow` op). Each file is one case:

- `direct-property.tsx`: a prop read reaches a JSX text slot.
- `same-name-negative.tsx`: two bindings with a `name` field; only the selected one reaches its slot.
- `null-vs-finite.tsx`: `count ?? 0` keeps zero; `maybe!` is an assertion, not a check.
- `two-call-helper.tsx`: one helper called twice. Until invocation identity lands, the walk stops at the helper with a `boundary` row (`unproven-handoff`) instead of joining the two calls.
