# Value-flow with no null proof

A project whose jsconfig leaves `strictNullChecks` off. The engine analyzes it and every result says `nullProof: false`. A trace still holds, but a type can no longer say that a value may be undefined, so a rule that reads `undefined` from a type must not prune on it. `engine/test/srcly/fixture-annotations.test.ts` checks these fixtures.

- `loose-flow.js`: a value through a helper, in plain JavaScript.
- `loose-props.tsx`: `mergeProps` keeps a prop when a later value is not a literal, because `string` here may be undefined.
