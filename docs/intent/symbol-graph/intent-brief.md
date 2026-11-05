---
title: "Symbol graph"
slug: "symbol-graph"
phase: intent
status: current
last_updated: "2026-11-05"
---

# Symbol graph

## My read

You want srcly to be the best tool for tracing how a TypeScript or Python codebase hangs together, and the import graph is not enough. It shows *module seams*: which file imports what, refined to the top-level declaration that uses it. It cannot show a method calling a method, a function calling another in the same file, who writes a piece of state, or a chain three calls deep. The data-flow engine traces *values* precisely, but it is heavy, lazy and needs Node, and a value trace answers a different question from "who calls this?".

The missing layer is a **symbol graph**: every function, class, method, field, variable and type as a node, and each place one of them calls, instantiates, reads, writes, extends or names another as a typed edge with its line. It is always available (built by name from tree-sitter, cached like the import graph), honest about how sure it is, and drawn in the graph view you already have.

## What matters most

- **Members and intra-file links.** Methods are nodes with their class as container; nested functions with their parent. A call inside one file is an edge like any other.
- **Edges mean something.** `call`, `instantiate`, `read`, `write`, `type`, `extends`, `implements`, each with the lines it happens at. Filterable.
- **Honest resolution.** Every edge says `exact`, `typed` (through a declared type or `new`) or `name` (a unique member name, for calls only). A guess is drawn as a guess, never as a fact.
- **Follow the chain.** Counts on every neighbour; expand one hop in place without refocusing; find the path between two symbols.
- **Both languages.** Python reaches the same contract: methods through `self`/`cls`, class-qualified members, module attributes, `__init__` re-exports.
- **Fast.** The index of srcly itself (736 TS files) builds in about 6 s once and answers neighbourhoods in milliseconds; neighbourhoods are served, never the whole index.

## The experience you want

1. From the go-to palette, the treemap, the import graph's symbol boxes or a right-click in the code viewer, you land on a symbol in **Symbols** mode of the graph view: the symbol centred, what references it on the left, what it references on the right, framed by file and class.
2. Each neighbour shows its own in/out counts. Clicking a count pulls that neighbour's hop into the view; the camera stays put.
3. Edges are drawn by kind and sureness. A legend and filters (hide `type`, hide `read`, hide tests) keep a hub readable.
4. The rail lists the reference sites of the selected box or edge, one row per line, each opening the code viewer there. That list doubles as a call hierarchy.
5. Pick two symbols and the view draws the shortest reference path between them.
6. Symbols nothing references, and symbols everything references, are badged.
7. A client `fetch('/api/x')` joins the FastAPI handler of `/api/x` as one `http` edge, so a TS+Python repo reads as one graph.

## Boundaries

### Must be true

- Available without Node and without the data-flow engine; the engine upgrades edges later, it never gates the view.
- Top-level symbol ids match the import graph's (`file#name`), so `at` and the existing navigation address both.
- A reference the extractor cannot resolve is dropped and counted, never attached to a plausible-looking target.
- Neighbourhoods, not whole-index payloads: a 2k-file repo has about 100k references.

### Must be avoided

- A flat force-directed symbol graph. The focus layout and its frames stay.
- Name-only resolution of property reads or of builtin member names (`.filter`, `.has`, `.push`): that is how a name-based index lies.
- A second toolbar or a second canvas. Symbols is the third mode beside Imports and Data flow.

## What seems settled

- Baseline by name first (tree-sitter on the server), engine-precise edges as a later upgrade carrying `resolution: checker`.
- Third graph mode, one adapter to the existing ViewModel, like Data flow mode.
- Members, nested functions and module-level code are nodes from the first version.

## Current reality that matters

- `services/deps/typescript_deps.py` attributes every use to the enclosing *top-level* declaration and skips same-file references (`emit_symbol_edges`).
- The engine's `linksOf` (`engine/src/srcly/typescript-host.ts`) already computes per-function calls, reads and writes with the checker; it is the natural source for the later precise upgrade.
- The anchor mode's symbol view (`viz/deps/flow/symbolView.ts`) draws a value trace as symbols; it is a different question (where a value goes) and stays as is.

## Next step after confirmation

Shape: the contract, the extractor's resolution rules, the API, and the stack of PRs.
