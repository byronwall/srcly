---
title: "Symbol graph — shape brief"
slug: "symbol-graph"
phase: shape
status: current
last_updated: "2026-11-05"
---

# Symbol graph — what we are adding

**Outcome:** From any symbol in a TS or Python repo you see who references it and what it references, by kind and by line, follow the chain hop by hop, and find the path to another symbol.

**Primary flow:** go-to palette (or a symbol box, a treemap tile, a code line) → Symbols mode centred on the symbol → expand a neighbour's hop → open a reference line in the code viewer.

## Feature scope

```text
Symbol graph
├── Server index (services/symbols/)                                       PR 1
│   ├── Symbol: id file#Qualified.name, kind function|class|method|field|variable|type|enum|module,
│   │   container, line range, exported, typed_as (new X() / : X), members, bases
│   ├── Reference: source → target, kind call|instantiate|read|write|type|extends|implements,
│   │   line, resolution exact|typed|name
│   ├── TypeScript extractor (tree-sitter, scope stack, shadowing, barrels through TsProgram)
│   ├── Member settlement after all files: this/super, class-qualified, module attribute,
│   │   typed receiver, else a unique non-builtin member name for calls only
│   ├── Cache by file mtimes; GET /api/symbols/graph (neighbourhood, hops ≤ 4, kinds, direction,
│   │   tests), GET /api/symbols/search
│   └── Python extractor: same contract (self/cls, Class.member, module.attr, __init__ passes)  PR 2
├── Client: Symbols mode of the graph view                                 PR 3
│   ├── ?view=graph&symbols=<id>; Imports / Data flow / Symbols switch
│   ├── adapter → ViewModel: focus centre, referrers left, referenced right, frames per file,
│   │   sub-frames per class; edge style by kind, dotted for `name` resolution
│   ├── in/out counts on every box; click a count → that hop opens in place (`open=` list)
│   ├── legend + filters (kinds, tests); rail lists reference lines, each opens the code viewer
│   └── entry points: go-to palette (server search), code viewer menu, treemap tile, import graph box
├── Path between two symbols (server BFS, drawn as a chain)                PR 4
├── Dead and hub overlays (inCount 0; top in-degree) as badges and a filter  PR 5
└── HTTP seam: client fetch('/api/x') ↔ FastAPI/Flask handler, kind `http`   PR 6
```

## Behaviour

| Situation | Expected result |
| --- | --- |
| `this.save()` inside `Store.bump` | `Store.bump —call→ Store.save`, `exact` |
| `x.bump()` with `x: Store` | `—call→ Store.bump`, `typed` |
| `props.s.bump()` and exactly one member named `bump` | `—call→ Store.bump`, `name`, drawn dotted |
| `items.filter(...)` with an unknown receiver | Nothing drawn. Counted as unresolved only if some symbol is named `filter` |
| `super.row()` | The base class's `row`, never the subclass's override |
| `const api = { get() {} }` | `api.get` is a method node with `api` as container |
| Module-level `outer();` | Source is the file's `module` node |
| A focus with 400+ symbols within the hops | `truncated: true`; the client says so and offers filters |

## Decisions and boundaries

**Appetite:** one stack of six PRs; each lands on its own and the view is usable from PR 3.

**Key decisions:**

- **Name-based first, honest about it.** `resolution` is on every edge. The data-flow engine can later re-resolve a neighbourhood with the checker and replace `name`/`typed` edges with `checker` ones, the way Data flow swaps its surface for the complete graph.
- **Neighbourhood API, index on the server.** The whole index is tens of MB on a 2k-file repo; the view only ever needs a few hops.
- **Third mode, one adapter.** The dependency canvas, layout, go-to palette, node menus and rail are reused through an adapter like `flow/adapter.ts`; nothing new is drawn by hand.
- **Ids line up.** `file#name` for top-level symbols is the import graph's id, so `at`, Open code and Trace already work on them; members add `.member`.
