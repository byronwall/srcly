# Checker-bound symbol index (plan)

Status: proposed, not built. Retire this folder when the last milestone lands.

## Diagrams

Draftably sources in this folder. Open them with `draftably open docs/intent/checker-symbol-index`.

- [goals.draft](goals.draft): the goals, the design choices and the proof, on one map.
- [binding.draft](binding.draft): how one request is bound, with the tree-sitter fallback.
- [delivery.draft](delivery.draft): the milestones, the M0 gate and the compare loop.

## Problem

The TypeScript symbol index (`server/app/services/symbols/typescript.py`) binds each name with tree-sitter and its own scope rules. #486 fixed three gaps after three Codex rounds and left five open. All five are binding questions that the TypeScript checker already answers:

| #486 finding | Why tree-sitter misses it | Closed by this plan |
| --- | --- | --- |
| P1 `typescript.py:786`: `pick<typeof import("./m").Row>()`, a type named `then`, JSX type arguments | The parse loses the type position | Yes. The checker gives the meaning at the location |
| P1 `CodeModal.tsx:225`: Show references on a use of a split name opens the value | The client looks the name up by text | Yes. Lookup by source position (M3) |
| P2 `typescript_deps.py:399`: a barrel imports interface `T`, declares value `T`, exports `{ T }` | One target per export hop | Yes for refs and the Symbols view. The Imports graph keeps tree-sitter (see "Imports graph") |
| P2 `typescript.py:795`: forward reference to a block-local alias | Block-local types are not predeclared | Yes |
| P2 `typescript.py:79`: `export default function A` plus `export type A` | No visibility check per public name | Yes |

The larger gain is member references. Today the index guesses a member's target from a declared type (`typed`) or a unique member name (`name`), and leaves the rest unresolved. Measured 2026-11-27 on this branch's base (`54bf3bba`); the snippet below the table recomputes it:

| Repo | TS references | `exact` | `typed` | `name` | Unresolved members |
| --- | ---: | ---: | ---: | ---: | ---: |
| srcly | 40,261 | 32,132 | 7,728 | 401 | 40,529 |
| explorEDA | 49,069 | 42,468 | 6,263 | 338 | 9,986 |

The unresolved count includes library members (`arr.map`), so it is an upper bound. The checker binds `props.store.bump()` to `Store.bump` where tree-sitter can not. `srcly refs` exists so an agent can find every caller before it deletes code. A member call through a parameter is the caller it misses most.

```python
# Recompute (from server/):
from pathlib import Path; from collections import Counter
from app.services.symbols.index import build_symbol_index
ix = build_symbol_index(Path("<root>"))
refs = [r for r in ix.references if ix.symbols[r.source].language == "ts"]
print(len(refs), Counter(r.resolution for r in refs), ix.unresolved_members)
```

## Design

### Who owns what

- **Tree-sitter keeps the declarations and the ids.** `file#Name`, `file#Class.member`, `file#Name@type` stay as #486 made them. The Imports graph, `at` links and saved URLs do not change. The engine never builds an id.
- **The checker owns binding.** For each identifier, it says which declaration TypeScript binds, or that nothing is bound.
- **The join key is `(file, line, name, meaning)`** for a declaration's name, where `meaning` is `value` or `type`. Both sides know all four. No column conversion is needed, so engine UTF-16 spans and tree-sitter bytes stay apart (`docs/dataflow-engine.md`, "Outcomes and positions"). `meaning` separates `A` from `A@type` when both sit on one line.

This follows "derive one from the other": one naming rule (tree-sitter), one binding rule (checker). A key that matches no tree-sitter symbol is a counted mismatch, never a guessed id.

### Engine op: `symbolRefs`

Tier 1, on the primary Program. The steps follow AGENTS.md "To add an op".

Params: `files` (optional; absent means every source file the Program owns under the root), `expectedGeneration`.

Result per file:

```ts
{
  file: string,
  refs: Array<{
    span: Span,                         // the identifier, 1-based UTF-16, like every contract
    kind: "call" | "instantiate" | "read" | "write" | "type" | "extends" | "implements",
    source: DeclKey | null,             // nearest enclosing named declaration; null = module code
    target: DeclKey | null,
    unbound: "any" | "unresolved-module" | "external" | "library" | null,
  }>,
}
// DeclKey = { file, line, name, meaning: "value" | "type" }
```

How the op binds a reference:

- It walks every `Identifier` and `PrivateIdentifier` that is not a declaration name.
- It calls `getSymbolAtLocation` and follows aliases to the declaration with `getAliasedSymbol`. That covers imports, re-exports, barrels and `import("…").T`.
- The checker already filters by meaning at the location. For a merged symbol (class plus interface), the op picks the declaration whose flags match the location, else the first one. Tree-sitter keeps those as one symbol, so either key matches.
- A target outside the root, or in `node_modules` or a `.d.ts`, is `external` and is dropped by Python, as today.

`kind` comes from the parent node (call callee, `new`, assignment target, heritage clause, type node). It is the same syntax rule as `RefKind` today, now on the TypeScript AST.

The op leaves out HTTP references. `fetch("/api/x")` matching stays in Python, which already does it per symbol.

### Python merge

`build_symbol_index` takes declarations from tree-sitter as today. When the checker is available, it uses the engine's refs instead of the tree-sitter refs for TS files:

1. It maps each `DeclKey` to a tree-sitter symbol id. A miss on `target` drops the ref and adds to `mismatched_keys`. A miss on `source` attaches the ref to the module node.
2. A bound ref is `exact`. The `typed` and `name` resolutions do not happen for TS refs. An `unbound` ref stays out of the graph and is counted by reason in `SymbolIndexInfo`.
3. Each ref keeps its span (`line`, `column`, `end_column`, UTF-16). `Reference` gains `column` and `end_column`, `None` for tree-sitter refs.
4. `SymbolIndexInfo` gains `binder: "checker" | "tree-sitter"` and, for tree-sitter, the reason (`no-node`, `no-tsconfig`, `memory-limit`, `timeout`, …). The Symbols view and `srcly refs` print it, so an answer names its binder.

Files that the Program does not own (outside every tsconfig) keep tree-sitter refs inside a checker index. They are counted as `outside_program` and named in the info. This is the only place the two binders mix, and it is per file, never per reference.

### When the engine runs

Invariant 1 says the base scan never waits. The symbol index is not the base scan:

- `srcly refs` and `srcly symbols` start the engine, like `--dataflow`. They wait for it, and fall back with a printed reason.
- The Symbols view and Show references start it on first open. That adds them to invariant 1's explicit-use list. While the engine builds, the view shows "binding with the checker" and the tree-sitter answer greyed. It does not draw that answer as final.
- The cache key becomes `(source_signature, programHash)` in checker mode. The generation goes into the response, and a stale query is `stale`, as for every engine op.

### Imports graph

`build_ts_edges` stays tree-sitter. It is part of the base scan and must draw without Node. Its P2 (`typescript_deps.py:399`) stays open there. After M2, the proof script also compares the Imports graph's symbol edges with the checker index's cross-file refs, rolled up to top-level symbols. Disagreements become fixes in the tree-sitter export walk, or named limits. A checker-drawn Imports graph is out of scope until the engine is warm at scan time, which `docs/dataflow-engine.md` dropped on purpose.

### Show references by position (client)

`CodeModal`'s `onReferences` sends `{file, line, column}` (UTF-16, as the editor reports it) to a new `GET /api/symbols/at`. The server answers in this order:

1. A ref whose span covers the position: its target.
2. A declaration whose name is at that line and name: that symbol.
3. Nothing: "No symbol bound here". It never falls back to a name search.

In tree-sitter mode, refs have no columns. Step 1 matches the line and the identifier text, and when two targets tie, the answer says so instead of picking the first. The treemap tile already has the symbol id, so it passes the id with `@type` and never searches.

## Cost

Measured numbers for tier 1 (`docs/dataflow-engine.md`): visual-notes `app/` 13.9 s and 2.0 GB, srcly `client/` 3.0 s and 2.4 GB. The walk adds `getSymbolAtLocation` on every identifier. On a property access, that forces the checker to type the receiver expression, which is close to a full type check. It is not measured yet. M0 measures it before anything is built.

M0 gate, on `~/Projects/visual-notes`, under `node --max-old-space-size=4096`, one process at a time across sessions:

- The walk takes 20 s or less on top of the Program build.
- Peak heap after a full GC stays under `SRCLY_DATAFLOW_MEMORY_MB` (2,560 MB). If it passes, the memory guard can drop the session and the op answers `memory-limit`, which falls back to tree-sitter with that reason.
- The result for every file is 40 MB of JSON or less. If it is larger, the op streams per file or Python asks per folder.

If M0 fails, stop and record the numbers here. The five findings then stay as named limits.

### M0 result (2026-11-27): go

A throwaway spike bound every identifier with `getSymbolAtLocation` and alias resolution, one run per root (the op's cost is now `cd engine && node --expose-gc --max-old-space-size=4096 --import tsx scripts/symbol-refs-probe.ts --root <repo>`), `node --expose-gc --max-old-space-size=4096`. Heap is after a full GC.

| Root | Files | Build | Walk | Heap built → walked | RSS | JSON | Bound | Unbound | External |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| srcly `client/` | 196 | 1.4 s | 1.6 s | 319 → 396 MB | 664 MB | 2.8 MB | 41,467 | 821 | 14,152 |
| visual-notes | 691 | 3.1 s | 4.5 s | 555 → 885 MB | 1,157 MB | 3.7 MB | 44,571 | 4,141 | 21,694 |
| srcly (whole repo) | 707 | 2.4 s | 4.7 s | 542 → 771 MB | 1,050 MB | 12.7 MB | 151,560 | 2,476 | 55,922 |
| explorEDA | 819 | 3.2 s | 6.8 s | 604 → 886 MB | 1,187 MB | 15.9 MB | 163,849 | 6,096 | 49,865 |

Every root is well inside the gate: a walk of 7 s at most, heap under 900 MB, JSON under 16 MB.

## Fallback

No Node, no engine, no tsconfig, crash, timeout or `memory-limit`: the index is tree-sitter only, exactly as today, with `binder: "tree-sitter"` and the reason. The fallback does not try to approximate the checker. That keeps one binder per answer, and the tree-sitter code stays as it is and gets no new rules.

## Proof at product scope

`server/scripts/compare_binders.py <root>` builds both indexes and compares every TS reference by `(source file, line, identifier, target)`:

- `agree`: same target.
- `checker-only`: the checker binds it, tree-sitter has no ref (expected: members, the #486 cases).
- `tree-sitter-only`: tree-sitter binds it, the checker says `unbound` or something else (every one is a tree-sitter false positive or a mapping bug).
- `differ`: both bind, to different symbols.
- `mismatched_keys`: checker declarations with no tree-sitter symbol, listed by declaration kind.

Run it on srcly and explorEDA (`f44a5c63` or newer). Done when:

- `mismatched_keys` is 0 for exported and top-level declarations. Any key on locals is listed and explained.
- Every `differ` and `tree-sitter-only` row is in a named bucket. Check a sample of 20 per bucket by hand. Each bucket is a checker-correct case, or a bug fixed before merge.
- The five #486 cases have fixtures in `server/tests/test_symbol_index_ts.py`. They pass in checker mode, and the tree-sitter mode answers still pass.
- `srcly refs` on the #486 proof symbols (`AnalysisSourceRow`, `SavedDataStructure`, `EvidenceCollector`) lists at least the same callers as #486.
- The PR states how many references each repo compared, for example "47,524 of 47,524 explorEDA references compared".

## Milestones

| | Milestone | Done when |
| --- | --- | --- |
| M0 | Spike: a throwaway walk script on visual-notes and srcly | The cost gate above has numbers. Go or stop is recorded here |
| M1 | `symbolRefs` op, contract, Pydantic mirror, route | Engine tests pass on `examples/value-flow-basics`, plus a fixture per #486 case |
| M2 | Python merge, `binder` info, `compare_binders.py` | The proof above passes on srcly and explorEDA |
| M3 | `/api/symbols/at` and Show references by position | A Playwright test clicks a use of a split name and lands on `@type` |

M1 to M3 change core logic (two binders that must agree). Each one gets the Codex review loop.

## Recommendation

Build it, but only after the M0 gate passes. The five #486 findings are rare: 23 of 47,524 explorEDA references moved in #486. They alone would not pay for an engine op. What pays is member binding: about 8,100 srcly references are guessed today (`typed` plus `name`), and the unresolved pool is much larger. Those are the callers `srcly refs` misses before a delete. The design adds no new id scheme and keeps tree-sitter unchanged as the fallback. So a failed M0 costs one spike and nothing else.

Do not move the Imports graph to the checker. It must draw without Node, and its one open finding is cheaper to fix in the tree-sitter export walk.
