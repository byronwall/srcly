# srcly engine

The tsx-data-flow analysis, moved into srcly. It proves how values move through TypeScript and Solid code: routes, component occurrences, field lineage and evidence slices. srcly draws the results; this package only computes them.

It is a standalone pnpm package beside `client/`, with its own lockfile. Where it came from is in [UPSTREAM.md](UPSTREAM.md).

```bash
cd engine
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc
pnpm lint
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/project` | project discovery, tsconfig resolution, TypeScript programs |
| `src/analysis` | tracing, evidence collection, route totality, field lineage |
| `src/api` | Zod contracts and projections of analyzer objects |
| `src/reports` | Markdown and JSON report views |
| `src/service` | the worker-thread analysis service, cache and source excerpts |
| `examples/` | fixture projects the tests and acceptance runner use |

## Field proof acceptance

The acceptance runner is the authority for named field-to-consumer proof:

```bash
pnpm accept:route-field-proof \
  --root examples/compact-field-proof \
  --route /projects \
  --source <source-key-or-file:line[:column]> \
  --obligations scripts/route-field-proof-obligations.json
```

See [docs/route-field-proof-acceptance.md](docs/route-field-proof-acceptance.md), [docs/analyzer.md](docs/analyzer.md) and [docs/CONCEPTS.md](docs/CONCEPTS.md).
