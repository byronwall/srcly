---
title: Dependency-aware analysis reuse
origin: repo-reading-brief
topic_id: srcly.dependency-aware-analysis-reuse.v1
source_edition: 2026-10-24
source_url: https://chatgpt.com/space/page_07e288cdd0fc8191abed3e556b747d4a
status: research-proposal
---

# Dependency-aware analysis reuse

Assistant-generated research from the [October 24, 2026 daily brief](https://chatgpt.com/space/page_07e288cdd0fc8191abed3e556b747d4a). Exclude this document, its branch, PR, and derivative assistant research from future substantive-activity ranking. They are research input, not evidence of product implementation or demand. Stable topic ID: `srcly.dependency-aware-analysis-reuse.v1`; origin: `repo-reading-brief`.

## Decision to investigate

Can one small, location-free semantic result survive an edit while the existing session still returns the same findings and positions as cold analysis? First write an invalidation ledger and replay edits. Do not adopt Rust/Salsa, replace the engine, or build a generic incremental framework. Retain coarse rebuilds if one-shot scans dominate or fine-grained reuse fails to earn its cost.

## Source synthesis

Aleksey Kladov's [Durable Incrementality](https://rust-analyzer.github.io/blog/2023/07/24/durable-incrementality.html), July 24, 2023, distinguishes executing a query from validating its dependencies. Queries include arguments; dependencies are recorded during evaluation. Lazy validation revisits work only when requested. Early cutoff stops change propagation if an intermediate result remains equal; source offsets can prevent that equality even after a whitespace-only edit. Durability classes and a version vector can avoid traversing unchanged dependency subgraphs; a derived result takes the least durable class of its dependencies. Durability is a validation optimization, not a claim of immutability.

Transfer those concepts to Srcly only after naming trustworthy inputs and equality. The article's Rust API and rust-analyzer workload do not establish a suitable implementation or expected speedup here. Missing dependencies can return wrong answers; extra dependencies mostly waste work.

## Verified repository state and existing decisions

Inspected October 24, 2026. Main is `b3117e3b4c9c8d2b9d54a3dea0a590c375d20c55`. Its [code map](https://github.com/byronwall/srcly/blob/b3117e3b4c9c8d2b9d54a3dea0a590c375d20c55/docs/CODE_MAP.md) describes the Python scan pipeline. The following stack is **open, not merged into main**:

| PR and inspected head | Existing contribution |
| --- | --- |
| [#104](https://github.com/byronwall/srcly/pull/104), `72aed9b642ee9d3c3c19106f06ead479c71aba6f` | Moves the TypeScript analysis into engine/ |
| [#105](https://github.com/byronwall/srcly/pull/105), `775aa49609800c080964e22a67b7125d7b8343bf` | Stdio protocol and tier-1 session |
| [#106](https://github.com/byronwall/srcly/pull/106), `1c61287288015e46a38a85f46968dfbf50b80d68` | Python owns a lazy child, request cancellation and process lifecycle |
| [#107](https://github.com/byronwall/srcly/pull/107), `582927943d68b7514a8054412ad75d893b1e3ff6` | Route graph backbone, lazy totality and progress |
| [#108](https://github.com/byronwall/srcly/pull/108), `b4c7508eb93c68291c6f7092856e182a486c3e76` | Selected origins and proven destinations |
| [#109](https://github.com/byronwall/srcly/pull/109), `a380ff5f17cef41be434279c05f439aacabe1235` | Value-flow ledger and expected-generation guard |
| [#110](https://github.com/byronwall/srcly/pull/110), `fd34a86243997f7a70c9b9b2eddd4f1868ed6f84` | Graph kind marks and flow counts |

[#111](https://github.com/byronwall/srcly/pull/111) is also open, adding reach emphasis; it does not supersede this invalidation question. [#101](https://github.com/byronwall/srcly/pull/101) already proposes the integration architecture. Its [implementation plan at #106](https://github.com/byronwall/srcly/blob/1c61287288015e46a38a85f46968dfbf50b80d68/docs/intent/tsx-dataflow-integration/implementation-plan.md) selects stdio and Python lifecycle ownership rather than the older HTTP-child direction. Preserve those decisions.

In [session.ts at #106](https://github.com/byronwall/srcly/blob/1c61287288015e46a38a85f46968dfbf50b80d68/engine/src/srcly/session.ts), provider and fullReport are already lazily memoized. `refresh()` sets `tier1 = null`; the next query rebuilds and increments generation. This is not a proposal to add missing memoization. The [fingerprint](https://github.com/byronwall/srcly/blob/1c61287288015e46a38a85f46968dfbf50b80d68/engine/src/srcly/fingerprint.ts) combines source paths/size/mtime, config text, TypeScript and engine version. A same-size preserved-mtime edit is therefore an important identity test, not proof of an observed user failure.

Keep workspace epochs, cancellation, late-response handling, expected-generation checks and full-rebuild recovery. A cache must be bound to the source state it represents, including process/session identity after restart. A matching request ID alone cannot authorize reuse.

**Reported, not independently rerun:** #107 reports 68 seconds from cold UI start to first box; #109 reports 11.9 seconds to the first ledger and warm p50 1 ms / p95 3 ms (20 queries). These measure different paths. Neither establishes performance after incremental edits, nor shows that dependency tracking fixes cold startup.

Existing [#24](https://github.com/byronwall/srcly/pull/24) and [#34](https://github.com/byronwall/srcly/pull/34) concern Python analysis caching/fingerprinting. They are context, not evidence that the open TypeScript engine already has this proposed semantic dependency graph. Open proposal titles/bodies and existing docs/research were checked; no duplicate of this ledger/replay proposal was found.

## Candidate invalidation ledger — inference, not implemented behavior

Every row must record actual observed dependencies, not just the examples below. A cache key identifies the query; dependency versions prove whether its value is reusable. Use canonical paths plus project identity, not filenames alone.

| Stage | Inputs and candidate key | Equality / early cutoff | Dependents | Discard reason |
| --- | --- | --- | --- | --- |
| Source text | File content, existence, discovery set; project + canonical path + verified content identity | Exact bytes/content digest; do not trust size/mtime as complete identity | Syntax, import/export extraction, positions | Changed bytes, create/delete, undiscovered new file, identity uncertainty |
| Imports/exports | Syntax, compiler options, module rules; file + extractor/schema version | Ordered/canonical semantic declarations including aliases and re-exports; exclude offsets only when safe | Resolution, local facts where binding matters | Signature/specifier change, config change, unsupported syntax |
| Local location-free flow facts | Expressions, lexical binding, relevant type facts and analyzer rules; file + stable semantic node + rule version | Canonical facts/proofs without textual offsets; identity stability must be demonstrated | Cross-file resolution and displayed evidence | Expression/binding/type change, ambiguous identity, analyzer change |
| Cross-file resolution | Imports/exports, local facts, resolved declaration identities, config/dependency graph; project + query args + resolver version | Resolved targets and proof/status equality, including unsupported/boundary reasons | Route/flow answers and display projection | Import rewiring, target deletion, package/config/TypeScript change |
| Display positions | Current text, semantic-to-syntax anchors and semantic result identity; source state + finding identity | Exact current ranges and mapped evidence | Viewer overlays, ledger/graph navigation | Text shift, stale/ambiguous anchor, deleted source, generation mismatch |

A "location-free" stage may still depend on compiler-inferred types in another file. Do not declare it local merely because its output has no ranges. New imports, re-exports, glob discovery, package exports, declaration files and configuration inheritance need explicit coverage. Unknown dependencies require conservative rebuilding.

Durability is a second decision: workspace text might be volatile, dependencies less volatile, compiler/config separately versioned. A dependency update must advance all affected classes. Add classes only if revalidation traversal itself is measured as costly; do not introduce them merely to increase cache-hit counts.

## Small experiment for a separate future agent

Use a disposable two-module fixture with one route, a re-export and a typed value-flow query. Pin the selected open-stack SHA and dependency versions; also retain main as a separate baseline. Do not combine unmerged code with main silently.

After each edit, run the same query warm and in a fresh cold process. Compare findings, proofs, unsupported/partial states, target identity and exact displayed locations, normalizing only documented nondeterministic fields.

| Replay | Required observation |
| --- | --- |
| Whitespace/comment insertion | Semantic parity; positions move correctly; candidate semantic equality is tested |
| Local expression edit | Changed facts and downstream results update; unrelated results remain correct |
| Exported signature edit | All affected consumers and type-dependent facts revalidate |
| Import rewiring / re-export | Resolution follows new target even when exported names stay equal |
| File deletion (and creation) | No dangling finding or undiscovered replacement |
| Config / dependency / analyzer version change | Affected keys/dependencies invalidate, including declaration inputs |
| Worker restart | New process identity prevents reuse of stale generations |
| Same-size preserved-mtime edit | Warm result equals content-based cold truth despite unchanged stat metadata |

Record **query executions**, **revalidation visits**, **latency** (cold startup, first fact index, warm query, post-edit query separately), and **retained memory** separately. Include workload size, sample count and full-rebuild cost. Cache-hit rate cannot substitute for any of these. Measure correctness before interpreting timing; no experiment or performance claim is supplied by this PR.

## Questions, stopping rule and next steps

1. Which real repeated-edit workflow needs reuse, and is a coarse rebuild already acceptable?
2. Can a semantic node retain identity through text movement without hiding changed bindings?
3. Are all compiler/config/dependency inputs visible, and how will additions outside the current source list be discovered?
4. Does invalidation reduce execution, only shift cost into revalidation, or increase memory beyond its benefit?

A future agent should refresh PR/main state, inspect the integration plan, fill the ledger from actual call sites, and propose one isolated semantic seam with the replay results. Keep the existing session boundary and full-rebuild fallback. Reject the seam on any parity failure; reject added machinery if coarse rebuilding meets the measured workload. Only then propose a separately authorized implementation PR.

## Validation and limits

Documentation only. Source article and source edition were read; live PR metadata and pinned session/fingerprint/lifecycle code were inspected on October 24, 2026. No benchmark, fault injection, library adoption or implementation test was run. Repository CI remains useful for the docs commit, but cannot validate this unimplemented hypothesis. Upstream PR reports are author evidence, not independent measurements. No AGENTS or skill changes are proposed; future brief selection should enforce the origin/topic exclusion above.
