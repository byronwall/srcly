---
title: Offline evidence packets for library model review
origin: repo-reading-brief
topic_id: srcly.dynamic-library-model-evidence.v1
source_edition: 2026-10-30
source_url: https://chatgpt.com/space/page_ed98b10c35f88191b471fc5ee4f7b794
status: research-proposal
---

# Offline evidence packets for library model review

Assistant-generated research from the [October 30, 2026 Repo Reading Brief](https://chatgpt.com/space/page_ed98b10c35f88191b471fc5ee4f7b794). Exclude this document, branch, PR and derivative assistant research from future substantive-activity ranking: they are research input, not independent demand. No experiment, instrumentation, TASER execution or model change was performed for this proposal.

## Question and bounded contribution

Would a small, offline packet of observed library boundary behavior help a developer review an **existing** model row more accurately than ordinary fixture assertions alone? The hypothesis is that callback timing, absent execution and identity distinctions might expose a review mistake hidden by a correct static endpoint. This is unvalidated; a packet may add no useful information.

The contribution is a proposed comparison protocol and review record. It adds no runtime product facility, user-project capture, automatic model extraction, confidence upgrade or new row semantics. It does not fill the gaps already owned by the implementation stack.

## Reading

Cristian-Alexandru Staicu, Martin Toldam Torp, Max Schäfer, Anders Møller and Michael Pradel, [Extracting Taint Specifications for JavaScript Libraries](https://cs.au.dk/~amoeller/papers/taser/paper.pdf), ICSE, May 23–29, 2020; [author project page](https://cs.au.dk/~amoeller/papers/taser/).

TASER suggests library taint specifications from dynamically observed boundary access paths. Observations underapproximate behavior; taint does not establish value identity. Its Node.js results do not validate this proposed browser fixture review.

## Verified baseline and ownership

Inspected October 30, 2026 at main `e6ac78409878fa012538f90bb2a12258cc17cfb5`. Links below use that snapshot unless stated otherwise. Facts here come from source inspection, not runtime measurements.

| Existing evidence or owner | Consequence for this proposal |
| --- | --- |
| [Library model loader/schema](https://github.com/byronwall/srcly/blob/e6ac78409878fa012538f90bb2a12258cc17cfb5/engine/src/analysis/library-models.ts), `engine/models/solid.json` | Validated manual rows, module/member keys and existing proof names already exist. Review those rows; do not propose another registry or automatic installation path. |
| [Library models plan](https://github.com/byronwall/srcly/blob/e6ac78409878fa012538f90bb2a12258cc17cfb5/docs/intent/dataflow-library-models/plan.md) | Already borrows CodeQL access-path concepts, distinguishes value from taint and preserves the assumed fallback. Packet paths are observation notation, not a replacement row format. |
| [#300](https://github.com/byronwall/srcly/pull/300), [#303](https://github.com/byronwall/srcly/pull/303), [#304](https://github.com/byronwall/srcly/pull/304) | Open implementation work owns library-supplied callbacks, expected catalog end kinds and Zustand store flow. Do not duplicate these mechanisms or choose their known gaps as this pilot's target. |
| [#306](https://github.com/byronwall/srcly/pull/306), head `30af69ea808ab15aea21d45b65ec821d14964084` | Open report claims 105 correct end kinds, with 96 proven and 9 assumed. These are author-reported results, not independently rerun here, and the implementation stack is not merged. |
| [#256 reconciliation, DA-011](https://github.com/byronwall/srcly/blob/codex/dependency-analysis-ui-pro-research/docs/research/dependency-analysis-ui-2026-10-28/reconciliation.md) | Runtime questions and recorded runs remain deferred outside static evidence improvement. This proposal neither reassigns that work nor supplies a product runtime answer: only isolated synthetic fixture review is contemplated. |

Independent demand is the current callback/catalog/store implementation and its coverage report. Prior assistant daily briefs #113 and #153, and assistant research #256, were consulted only for deduplication and scope constraints; they do not count as demand.

Before this file was added, repository-wide text search covered current code, research, intent and backlog; acquisition-related searches also covered docs/backlog across 176 fetched remote refs. All-state PR searches included TASER, Staicu, instrumentation, extracting taint, dynamic/model, library/research and boundary/observation. Existing static models, timing instrumentation and runtime deferrals were found, but no matching offline acquisition/review protocol or rejection of this bounded technique. This is a dated search result, not a claim that future ownership cannot overlap. Recheck before any experiment.

## One-library candidate, not an executed pilot

Choose **Solid `solid-js` 1.9.17**, already declared in `engine/package.json`, resolved in `engine/pnpm-lock.yaml` and installed during repository bootstrap. No new dependency or npm crawl is needed. Review only the existing `createMemo`, `batch` and `onCleanup` rows in `engine/models/solid.json`.

Use callback expressions from `engine/examples/value-flow-basics/src/framework-flows.tsx` (`ff-memo`) and `engine/examples/pattern-catalog/solid/src/state.tsx` (`Total` / `s-memo`, `Pair` / `s-batch`) as source identities for at most four isolated synthetic cases. Do not import the whole fixture suite or execute arbitrary package/client tests. Any extracted case must record its adapter and changed inputs, because extraction can change semantics. In #306's head, `s-memo` and `s-batch` both declare `@want render-terminal`; main's catalog predates those declarations. Preserve both refs rather than silently treating that stack as main.

1. **Identity control:** a memo callback returns a synthetic object unchanged. Compare callback return and accessor result by reference, while recording entry/exit paths and callback order.
2. **Derived-value contrast:** adapt `ff-memo`'s string derivation or `s-memo`'s numeric reduction. Record that the result derives from the input but is not the same value. A taint-style dependency cannot authorize an identity claim; srcly's existing value derivation semantics remain the comparison target.
3. **Batched callback:** extract `Pair`'s callback and explicitly invoke its enclosing handler. Record setter calls in order and before/after synthetic state. Receiver mutation must be explicitly recorded as observed, not observed or not applicable; do not invent a receiver for a signal setter.
4. **Never-fired callback:** register `onCleanup` under a controlled owner and end the bounded observation window before disposal. Record registration, callback count zero, the intentionally unexecuted disposal branch and pending cleanup. Dispose after closing the window for harness hygiene, recording that separately. Zero calls in the window does not contradict a static callback relation or prove the callback can never run.

Future execution must use an explicitly recorded browser build and runner with browser export conditions, JSX compilation mode, owner setup and disposal policy. Solid's installed package has a server default entry; a convenient Node import is not equivalent browser validation. If a compatible local browser setup cannot be achieved without expanding scope, stop and record that limitation. No package installation or browser execution is proposed in this PR.

## Proposed packet schema

This is a developer review attachment outside the product model loader, not a new supported artifact API. One packet covers one pinned fixture/input/environment combination; no actual observations are supplied here.

| Field | Required contents |
| --- | --- |
| `identity` | Topic ID, packet schema revision, repository SHA, model-file digest and row key; package name/version, lockfile digest, resolved package integrity and resolved entry file. |
| `runner` | Runner/version, browser/version, OS/architecture, Node/build-tool versions, export conditions, JSX mode, instrumentation revision, owner setup, limits and observation window. |
| `fixture` | Original path, trace ID and SHA; extracted source digest, adapter diff, synthetic input values/digest, seed and explicit handler actions. No real project data. |
| `events` | Ordered sequence numbers with call/callback identity and parent call; observed entry and exit access paths, object identity tokens and scalar/derived results. Paths such as `Argument[0].Return` and `Return.Accessor.Return` describe this record only. |
| `effects` | Callback registration/invocation order and counts; receiver/property before/after writes, setter changes, absent receiver and unsupported observation points named separately. |
| `coverage` | Executed branches, intentionally unexecuted branches, callbacks not fired, excluded paths, exceptions, timeouts and instrumentation failures. Missing observations stay missing. |
| `comparison` | Exact current row and static fixture claim; catalog ref/trace/expected endpoint; direct assertion result and packet-assisted finding. Endpoint expectations are static claims, not observed DOM results unless actually checked. |
| `review` | Per-claim observation status, reviewer verdict with rationale, unresolved hypotheses and the next authorized review action. No machine-consumable proof upgrade. |

Keep **observed**, **not observed** and **contradicted** distinct. Observed means a named event occurred for this input and environment. Not observed includes unexecuted branches and unsupported instrumentation. Contradicted requires an explicit, applicable prediction and an incompatible observation with working controls; it triggers human investigation, not a universal refutation or rule rewrite. A row describing possible static flow need not predict callback execution in every run. Identity tokens establish only within-run reference comparisons, never general alias completeness.

## Separately authorized validation and stopping rules

A future agent must first reread `AGENTS.md`, relevant `.agents/skills` if present, the model plan, DA-011 and live ownership. This PR authorizes neither implementation nor the experiment. If separately authorized, pin the baseline and manually approve the four synthetic cases before running anything.

For each case, first review ordinary direct assertions for callback result, order/count and state change. Then review the same case with the packet. Record whether the packet changes a specific justified verdict or identifies an omission that the direct assertions missed, and what extra setup/review cost it introduces. Do not seed a bug in application code to manufacture an advantage. Run at most these four cases, one library version and one documented browser environment; do not grow a generic instrumentation framework.

- **No added review value:** retain ordinary fixtures and assertions; stop packet work.
- **Instrumentation incompatibility or changed behavior:** record the limitation and stop. Instrumented and direct executions must agree before interpreting an observation.
- **Observed mismatch:** preserve input/environment and inspect the row, harness and claim with a human. Do not install a rule, change proof names or turn `assumed` into `proven` automatically.
- **Unexecuted behavior:** retain the explicit unknown. A successful run cannot establish completeness, browser portability, all versions or all inputs.
- **Ownership overlap or rejected scope:** stop and attach the finding to the existing owner through a separately authorized workflow; do not open duplicate implementation work.

The review decision is whether this limited evidence technique merits further consideration. All product runtime questions, real-project capture and automatic model generation remain outside it.
