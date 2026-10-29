---
title: "Show the logic, not only the components — shape brief"
slug: "dataflow-logic-visibility"
phase: shape
status: draft
last_updated: "2026-10-28"
---

# Show the logic — what we are adding

**Outcome:** A Data flow trace reads as symbols and how they depend on each other. Transforms, state and the server hop are visible, and components are one kind of frame among others.

**Primary flow:** Open a route or anchor a symbol → see the main path (about 25 symbols) → grow it with a key or a slider → open any edge to its proof.

## Feature scope

```text
Symbol graph (the Data lens, for routes and anchors, TS and TSX)
├── PLANNED ADDITIONS
│   ├── One box per symbol
│   │   ├── Every read of one binding merges into its box: doc, doc(), doc.error, doc() in <Match when>
│   │   ├── Uses are listed on the box ("read 4×: when, prop doc, Title") and on its out-edges
│   │   └── An unnamed intermediate (call result, literal, prop read) folds into the edge it sits on
│   ├── Edges that say what happens
│   │   ├── Value flow: bold, labelled with its operation (.map, await, JSON.parse, prop, return)
│   │   └── Calls, callers and state reads/writes: thin grey links, one toggle
│   ├── Symbol kinds you can tell apart
│   │   └── State (signal, store, resource, memo, context) · transform result · origin · end
│   ├── Function frames with a role
│   │   ├── component · hook · helper · event handler · resource fetcher · server query · unknown
│   │   └── A folded frame shows its symbols in and out (id → DocDetail), never one grey box
│   ├── Server band
│   │   └── Server-side frames and the database sit in their own band; the hop is drawn across it
│   └── Main path first, then grow
│       ├── First screen: the strongest origin-to-end path, about 25 symbols; side branches as +N stubs
│       └── Grow with + / − or a depth slider (1, 2, 3, all); one stub opens with Enter
└── LATER POSSIBILITIES
    └── A types overlay (the shape of the value at each step)
```

## Behavior

| Situation | Expected result |
| --- | --- |
| Three reads of `doc` in one function | One `doc` box. Its out-edges are labelled `when`, `prop doc` and `Title`. |
| A binding's reads in two functions | One box in each frame, linked by the hand-off edge. A symbol never spans frames. |
| The engine sends no symbol for a node | The node stays its own box, as today. It is never merged by its label. |
| An edge folds three intermediates | The edge label names the operation. A click shows every step and its proof, as today. |
| A function's role is not known | The frame reads `unknown` with a neutral tint, not `component`. |
| Plain TS module, no routes | Anchor mode works the same. There is no Components lens and no server band unless the trace crosses one. |
| Grow past the walk limit | The slider stops at the engine's limit and names the stop, as frontiers do today. |

## Examples

`/docs/[id]`, first screen (*proposal*, wording not final):

```text
[URL] params.id ──id──▶ fetchDoc(id) ┆ server ┆ ──findUnique──▶ [DB read] doc row
     ◀──return DocDetail── doc (resource) ──when──▶ d ──prop doc──▶ DocumentViewer
                                                     └──title──▶ <Title>      +6 more
```

## Decisions and boundaries

**Appetite:** One initiative. The work replaces the Data lens's box model and folding. Route discovery, the walk itself and the Components lens stay as they are.

**Key decision:** Merge by the checker's symbol, not by label. Engine elements already carry `symbolId` (`program-evidence-compact-facts.ts`). The anchor contract does not send it yet. Sending it lets the client merge exactly. The label rule in `passThroughs` cannot merge `doc` and `doc()`, and it would wrongly merge two different `x`s. The roles, the operation names and the call links are also new contract fields. The client must not guess them.

**Boundary:** No new walk semantics in this initiative. Calls and reads come from facts the engine already has (`function-effects`, relations). A merge must keep every witness: the edges of a merged box still open to each original proof (#153). The old box model stays behind a view switch until the symbol view passes the visual-notes check.

**First proof:** **Try:** add `symbol` to the anchor contract, then merge by it in `anchorAdapter.ts`. Run this on a new small fixture (a route, a resource, a `Match`, a store, a server query, a `.map`, and one plain TS helper) and on `/docs/[id]`. **Observe:** the number of boxes before and after. Check that `doc`, `doc()` and the `when` read become one box, and that no two different bindings merge. **Decide:** if merging alone cuts `/docs/[id]` by a third or more, the main-path first screen can be built on symbols. If it does not, the main-path selection has to be done in the engine, and that comes before the frame and edge work.

**Settled choices (2026-10-28):** A field read (`doc.error`) merges into `doc`, and its edge carries the field name. The symbol kind carries the strong color, and frames stay neutral with a role word.

Intent: [intent-brief.md](intent-brief.md).
