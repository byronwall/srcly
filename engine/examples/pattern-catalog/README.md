# Pattern catalog

Everyday patterns in plain TypeScript, React and Solid, one trace each. `scripts/pattern-catalog.ts` runs them and counts how many reach an end:

```sh
cd engine && node --import tsx scripts/pattern-catalog.ts
```

Each pattern carries one `// @trace <id> <direction> <anchor>` comment. Unlike `value-flow-basics`, nothing here asserts an outcome: the catalog measures coverage, and the fixtures assert rules.

The React and Solid roots are graded against real library types, so each needs a `node_modules` with them. Link one from an app that has them (git ignores the link):

```sh
ln -s ~/Projects/<a React app>/node_modules engine/examples/pattern-catalog/react/node_modules
ln -s ~/Projects/<a Solid app>/node_modules engine/examples/pattern-catalog/solid/node_modules
```

React needs `react`, `@types/react`, `@tanstack/react-query` and `zustand`. Solid needs `solid-js` and `@solidjs/router`. A root without `node_modules` is skipped.

Results and the gap list are in `docs/research/dataflow-pattern-coverage-2026-10/README.md`.
