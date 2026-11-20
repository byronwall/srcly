# Dependency investigation tools: survey and workflow evidence

**Assignment:** `srcly.dependency-analysis-tool-ui-deep-dive.v1`  
**Repository context:** Srcly PR #256, fixed source baseline `ee8a771ce94fb59573492445d0f5fa2411ad83c8`  
**External retrieval:** October 28, 2026, America/Indianapolis (October 29 UTC for later retrievals)  
**Status:** completed primary-source research; all external-tool replay procedures below are **proposed and unexecuted**. No IDE was installed or personally exercised. Evidence consists of official documentation, inspected official figures/transcripts, selected public implementation, and maintainer reports. No external-tool speed, usability, or correctness comparison was measured. The separate Srcly report describes the isolated projection checks actually executed during this assignment; they are not live IDE or end-to-end engine experiments.

The most useful transferable mechanism is **a displayed relationship that opens its exact source evidence without changing the question**. Call hierarchy, value flow, reference counts, module reachability and runtime observations answer different questions. A concise trace does not prove every path, a graph edge does not prove invocation compatibility, and an empty result does not prove absence. These distinctions determine what Srcly may honestly borrow.

This survey covers **16 named products/services**. Counting the three JetBrains products as one family and excluding archived Sourcetrail still leaves **13 active independent product families/services**. VS Code with TypeScript and Pylance counts once; rust-analyzer is a distinct analysis service, not another independent editor UI. The six required deep cases are IntelliJ, VS Code, Eclipse, CodeQL, Semgrep and Joern; Understand adds a seventh. Visual Studio supplies an additional independent IDE comparison. Rider and Structure101 were not needed to meet coverage and no unverified capability is attributed to them.

### How to read the evidence

- **Documentation** states the vendor's exposed contract, not measured usability or soundness.
- **Inspected official figure** means the image was retrieved and visually examined; figure age is independent of current product version.
- **Source inspection** names the inspected release and routine; it is not an executed behavioral test.
- **Inference / proposed replay** is our transfer hypothesis or future test. Expected semantic answers below are hand oracles, not reported tool outputs.

Each source ID is a clickable exact primary URL, with a complete reference key at the end. All were retrieved on the date above. Reviewed releases are stated precisely where verified; “current docs” and historical screenshots are not silently upgraded to tested current binaries. For every profile, **query cost is unmeasured**. Setup, indexing/extraction, analysis, expansion and rendering costs remain separate.

## 1. Product coverage and semantic contracts

A **context** claim concerns which calling/receiving instance a relation belongs to; **field** precision concerns distinctions among fields/heap objects; **flow** precision concerns program-point state. Symbol resolution, a field-access label, or a source range alone does not establish any of these stronger guarantees. “Unknown” below is an explicit limit of the inspected evidence, not a negative product claim.

### IDE and language-service profiles

| Product / verified edition | Input, direction and result unit | Precision, models and completeness boundary |
| --- | --- | --- |
| **IntelliJ IDEA — 2026.2 help**, flow page 2026-08-14 | Java source + selected value; upstream/downstream source steps. Separate class/package/module dependency analysis. | General context/field/flow guarantees and framework model coverage **unknown** in inspected help. Java value-flow availability does not establish JS/Python availability. [IDE01] · [IDE06] |
| **WebStorm — 2026.2 help**, 2026-08-17 / 09-09 | JS/TS project and selected symbol; usages and caller/callee trees, with source occurrences and read/write/import distinctions. TSX relevance is through JS/TS tooling, not a verified reactive value model. | Context/field/flow guarantees **unknown**. Library scope and dynamic-string usages are exposed. General JS/TS value slicing is unverified; the retrieved official feature request still asks for it. [IDE03] · [IDE04] · [IDE05] |
| **PyCharm — 2026.2 help**, 2026-08-17 | Python project/interpreter and selected method/class; callers, callees and type hierarchy. Member plus occurrence granularity. | Context/field/flow guarantees **unknown**; general reflection, descriptor, closure and framework completeness unspecified. Project/library scope is documented; arbitrary-expression value slicing was not verified. [IDE07] |
| **VS Code — 1.144.0, 2026-10-28**; Pylance stable **2026.4.1**, prerelease **2026.4.101**; Pyright source **1.1.414** | TS/JS/TSX/JSX project or Python workspace/environment/stubs; definition/reference lookup and incoming/outgoing call items. Symbols, URI/ranges and call-site occurrences. Bundled TS-provider build was not pinned. | Provider-dependent; no invocation-paired value witness. General field/flow guarantees **unknown**. Workspace/library/stub coverage matters; implementation details below concern open Pyright, not the proprietary Pylance binary. [IDE08] · [IDE12] · [IDE13] · [IDE14] · [IDE15] · [IDE16] · [IDE27] · [IDE32] · [IDE40] · [IDE41] · [IDE42] · [IDE43] |
| **rust-analyzer — 2026-10-26 / v0.3.3097**, commit prefix `0c4d746` | Rust files, crate graph/cfg and semantic resolution; incoming function usages grouped by enclosing function, outgoing resolved callable syntax; navigation targets plus ranges. Crate dependency tree is separate. | Incoming/outgoing meanings differ in inspected implementation. No value-flow context/field/flow guarantee; unsupported outgoing callable kinds can be skipped. Macros/configuration matter; Rust borrow/type semantics do not transfer to JS. [IDE28] · [IDE29] · [IDE30] · [IDE31] |
| **Eclipse JDT — Eclipse 2026-09 / 4.41** | Java project/classpath and selected member; callers/callees, field read/write filtering, constructor-oriented expansion. Members plus source occurrences. | General context/field/flow guarantees **unknown**. Classpath/compile resolution matters. Potential reference matches can coexist with an empty call tree; arbitrary callback scheduler semantics are not established. [IDE17] · [IDE18] · [IDE19] · [IDE24] |
| **Visual Studio — 2026 18.11.2, 2026-10-25**; workflow docs in `vs-2022` view dated 2025-09-23 | Solution/project; C++ callers/callees, C#/VB callers, grouped call-site detail. Debugger data breakpoints separately observe storage changes. | Static context/field/flow guarantees **unknown**. Implicit calls/delegate references may be absent. Runtime results are run-specific. No TS/Python flow claim; current binary parity untested. [IDE20] · [IDE21] · [IDE22] |

### Specialized profiles

| Product / reviewed version | Input, direction and result unit | Precision, models and completeness boundary |
| --- | --- | --- |
| **CodeQL CLI 2.27.3 — 2026-10-20** | Extracted DB; JS/TS and Python relevant. Source→sink semantic value/taint nodes and witness paths; local or global libraries. | Global models cross calls/properties; taint can survive transformations that do not preserve values. General context/heap/field guarantee is library/configuration dependent; SSA distinguishes assignments. Models, barriers and exploration limits constrain answers. [SPC04] · [SPC05] · [SPC06] · [SPC07] · [SPC08] · [SPC09] · [SPC10] · [SPC11] |
| **Semgrep 1.182.0 — 2026-10-20** | Source plus rule; JS/TS/TSX and Python. Pattern-selected taint source→sink; variable/field-path state and reported trace. | CE principally intraprocedural; Pro adds interprocedural/interfile modes and additional control/index/path options. Basic field precision is variable based, not a heap-alias model. Engine mode, models and rules bound completeness. [SPC14] · [SPC15] · [SPC16] · [SPC17] · [SPC18] · [SPC19] |
| **Joern 4.0.666 — 2026-10-27** | Source→code property graph; JS/TS/Python frontends inspected, C replay. Source discovery/flow paths, separate call and control traversals; expression nodes. | General context/field/flow guarantee across frontends **unknown**. Type recovery, imports, overlays and external-call semantics affect results; CPG connectivity alone is not a feasible execution witness. [SPC22] · [SPC23] · [SPC24] · [SPC25] · [SPC26] · [SPC27] · [SPC28] · [SPC29] · [SPC30] · [SPC31] |
| **Understand 8.0 build 1265 — 2026-10-09** | Analyzed source DB; JS/TS, Python, Java/C-family among supported languages. Dependencies in either direction and references from/to; entity rollups backed by occurrences. | Structural reference aggregation, not general value flow. Context/field/flow sensitivity is **not established for value dependence**. Reference kinds/options and language coverage affect counts; parser completeness was not measured. [SPC32] · [SPC33] · [SPC34] · [SPC35] · [SPC36] |
| **Sourcegraph 8.1.0 reviewed — 2026-10-14**, newer 8.1.1335 linked | Repo search plus optional compiler-produced SCIP indexes; TS/Python indexers. Definitions/references/implementations at symbol granularity. | Precise indexed and search-based answers are distinct. Context/field/flow value sensitivity is not this lookup contract; index/model coverage and revision govern confidence. No runtime-use or value-flow guarantee. [SPC38] · [SPC39] · [SPC40] · [SPC41] |
| **Sourcetrail 2021.4 — historical**, archived 2021-12-14 | Offline indexed C/C++, Java, Python; native TS/TSX support unverified. Selected-symbol neighborhood plus search/code; incoming/outgoing relationship navigation. | Symbol/reference model; value/control/alias/context/field/flow precision **unknown**, not inferred from graph links. Local graph expansion/history useful as historical design evidence. [SPC42] · [SPC43] |
| **NDepend 2026.1.6 — 2026-06-01** | .NET assemblies required, PDB/source optional; assemblies/types/members, direct/indirect structural uses, cycles and matrix cells. | Assembly/reference analysis, not JS/TS/Python value flow. Context/field/flow sensitivity not established for that question; library assembly inclusion and source alignment matter. Matrix weight is not executable-path count. [SPC44] · [SPC45] · [SPC47] |
| **dependency-cruiser 18.6.0 — 2026-10-11** | JS/TS-family files with resolver/config; module import/require graph, cycles/rules, focus/reaches/affected queries, collapsed modules. | Module reachability; context/field/flow value sensitivity **not applicable**. Resolution/exclusions limit coverage. Output filtering may still require full analysis; framework callbacks are outside this relation. [SPC48] · [SPC49] · [SPC50] · [SPC51] |
| **Madge — manifest 8.0.0 reviewed** | JS/TS-family modules with extensions/resolver configured; forward/reverse dependencies, cycles and orphan files. | Module references; context/field/flow value sensitivity **not applicable**. Warning/skipped-module review is essential. No symbol, payload, control, alias or reactive execution model asserted. [SPC52] · [SPC53] |

### Setup, cost and access

| Product | Required setup / unmeasured cost | Access and adoption limits |
| --- | --- | --- |
| IntelliJ IDEA | Java/JDK/classpath import and indexing; broad backward dependency searches can cost more. | Free feature set, trial and paid Ultimate; this action's free-tier entitlement not separately verified. [IDE06] · [IDE33] |
| WebStorm | Open/import project, resolve packages and index; scope/result expansion affects workload. | Noncommercial use, trial and commercial licenses documented. [IDE03] · [IDE34] |
| PyCharm | Configure interpreter/project and index; dynamic environment affects resolution. | Pro trial/subscription documented; exact free-tier action entitlement not audited. [IDE07] · [IDE35] |
| VS Code TS / Pylance | Built-in TS project resolution; Python extension, environment/stubs and indexing. Pylance indexing consumes CPU/memory but is not all semantic analysis. | VS Code product license; proprietary Pylance, MIT Pyright core; no server deployment required. [IDE12] · [IDE15] · [IDE16] · [IDE41] · [IDE42] · [IDE43] |
| rust-analyzer | Load Cargo/crate configuration; incremental derived analysis and revision cancellation. | MIT/Apache-2.0. No measured latency prediction for Srcly. [IDE29] · [IDE36] |
| Eclipse JDT | Java project/classpath import and indexing; bounded scope, cancellation and subtree refresh. | Free/open source, EPL-2.0. [IDE17] · [IDE37] |
| Visual Studio | Install workload, load solution; debugger observation additionally needs supported runtime/session. | Community for qualifying individual use; commercial editions available. [IDE21] · [IDE38] |
| CodeQL | Extract DB, install query pack, compile/execute query; history records durations. | MIT VS Code extension; engine/private-code permissions separate. [SPC08] · [SPC10] · [SPC12] |
| Semgrep | Local source/rule scan; Pro account/tooling and greater interfile resources. | CE LGPL-2.1; Pro/service/rule-pack access separate. [SPC16] · [SPC17] · [SPC18] · [SPC19] |
| Joern | Import CPG and appropriate overlays; Scala query expertise; current repo lists JDK 21. | Apache-2.0. Extraction/query infrastructure is material for a personal tool. [SPC23] · [SPC24] · [SPC31] |
| Understand | Analyze a configured source project before browsing. | Commercial/trial; limited public-Git-project mode since build 1258 requires periodic online validation, not permissive source licensing. [SPC35] · [SPC36] · [SPC37] |
| Sourcegraph | Repository/search service, generate/upload precise indexes. | Precise navigation documented as Enterprise; infrastructure need not transfer to Srcly. [SPC39] |
| Sourcetrail | Local source indexing; archived maintenance status. | GPL-3; historical exemplar, not a recommended new dependency. [SPC42] · [SPC43] |
| NDepend | Build assemblies; matching PDB/source for links. | Commercial; Windows developer UI, separate build-machine offerings. [SPC45] · [SPC46] |
| dependency-cruiser | Resolver/rules, graph extraction, optional renderer. | MIT; shrinking rendered output may not shrink analysis. [SPC48] · [SPC49] · [SPC50] |
| Madge | Resolver/TS extensions/config; optional Graphviz rendering. | MIT, reviewed manifest Node ≥18. [SPC52] · [SPC53] |

## 2. Deep IDE workflows

The fixtures are authored for future replay. They are not copied vendor projects and no exact vendor output is predicted. Configure each project, record edition/provider/environment and compare observed output with the hand oracle. A misleading or empty result is evidence to record, not a reason to rewrite the oracle.

### Case 1 — IntelliJ: explain a Java value without losing its source

**Evidence:** docs and inspected figure. **Proposed question:** which source values reach this Boolean? Installation defaults were not exercised.

#### Reproducible documented sequence

1. Select the value → **Code → Analyze Code → Data Flow to Here**; choose scope/test inclusion.
2. Expand, optionally group by value/nullness, preview source, and refresh. [IDE01]
3. Use **Navigate → Back** to return to the prior caret location. Keep a separate hierarchy investigation by pinning its tab when exploring callers. [IDE02] · [IDE39]

#### Figure and annotations

![Official IntelliJ value-flow result tree](https://resources.jetbrains.com/help/img/idea/2026.2/dfa_results.png)

**Figure 1.** Official 2026.2 help figure, visually inspected. [IDE01]

1. Selected condition remains the root.
2. Rows pair statements with locations.
3. Leaves distinguish alternatives and call occurrences.

#### Interpretation and transfer

**Proposed Srcly interaction:** expose hidden witnesses as source rows while retaining the original question. Stop when the relevant producer and its call context are understood. A side-by-side comparison can test whether row reading helps users decide what matters without requiring every relation to become a canvas box.

The screenshot is not evidence that every path is feasible, that the setter applies to the same receiver instance, or that a write is unconditional. It also does not expose a general quantified completeness contract. For Srcly, a producer-first row therefore needs an explicit “execution conditions unresolved/available” attachment and separately inspectable object-identity evidence. Relevance ranking cannot silently discard either. This is a **design inference**, not a capability claim about IntelliJ.

**Poor fit:** a tree duplicates shared subexpressions and hides reconvergence. A graph can be useful after the user asks whether several producers converge on one effect. **What could make this pattern lose in Srcly:** if source rows force repeated navigation to understand component context, the existing folded graph may support the audit's route-wide questions with fewer orientation errors.

#### Adjacent mechanisms, not equivalent dependencies

IntelliJ's dependency analyzer uses a source-scope selection and separate analyzed-code, dependency-target and usage panes. Transitive depth is configurable. Module settings dependencies are a different input from source uses. These provide a useful **select a coarse relationship, then inspect its occurrences** pattern for Srcly imports, but should never be relabelled as payload/value dependence. [IDE06]

WebStorm's official call-preview figure pairs usages with a scoped call tree; PyCharm documents the related Python navigation workflow. These remain one IDE-family mechanism. A generic WebStorm help phrase about field flow is insufficient to establish IntelliJ-equivalent arbitrary value slicing, especially with the retrieved JS/TS feature request still submitted. The issue's full page was inaccessible; its status was observed in official search evidence, so feature absence is not asserted. [IDE03] · [IDE04] · [IDE05] · [IDE07]

#### Authored replay fixture and hand oracle

Create `FlagExample.java` in a configured Java project. Select `getComplete()` at the return in `readFlag`, run the case-1 sequence, and separately inspect the two assignments to `complete`.

```java
final class FlagExample {
  Boolean complete = null;
  void setComplete(Boolean value) { complete = value; }
  Boolean getComplete() { return complete; }
  Boolean readFlag(boolean initialize) {
    if (initialize) setComplete(false);
    return getComplete();
  }
}
```

**Hand oracle:** a fresh instance read with `initialize == false` returns `null`; with `true`, this method writes and returns `false`. The branch determines whether the setter executes. The two source values are not sufficient to explain that condition, and an analysis rooted only in the getter may also include assignments from callers outside this method. The replay asks whether the UI makes that scope distinction understandable; no exact vendor result is predicted.

### Case 2 — VS Code: references → rooted call tree → source peek

**Evidence mode:** current docs/API, historic official TS screenshot, current Pylance docs, and Pyright source inspection. **Question:** “Who calls this helper, and at which places?” **Unit:** a language-service symbol, not an arbitrary expression's value. **Scope:** configured project/workspace and provider, not all possible runtime imports or callers.

#### Reproducible sequence, not executed

1. In a configured TS project, put the caret on a function and run **Show Call Hierarchy** from its context menu/command search. Select incoming or outgoing direction and expand one child at a time. The official TypeScript introduction explains why a persistent tree preserves context better than recursively restarting reference searches. [IDE10] · [IDE11]
2. Select the occurrence and inspect its source. For a nearby-definition/reference question use **Peek Definition** or **Go to References**; the inline peek contains a result list plus source preview. Double-click a result to open the full editor. **Go → Back** returns to the previous location. [IDE09]
3. Repeat the call/reference question on a Python function with Pylance enabled. Record interpreter, workspace and extension version before comparing answers. Do not treat a Python import alone as an execution edge. [IDE12] · [IDE16] · [IDE25]

#### Official figures and annotations

![Official historical VS Code TypeScript call hierarchy](https://code.visualstudio.com/assets/updates/1_43/ts-call-hierarchy.png)

**Figure 2.** Official **VS Code 1.43 / TS 3.8** release figure; not a current 1.144 screenshot. [IDE11]

1. The left tree retains the queried function and expandable callers.
2. The right editor retains source and file/symbol context.
3. The visible entry action and toolbar surround the result; actual keyboard focus behavior was not tested.

![Official VS Code inline reference peek](https://code.visualstudio.com/assets/docs/editing/editingevolved/references.png)

**Figure 3.** Official generic editor figure uses **C#**; it supports the preview pattern, not TS/Python precision. [IDE09]

1. Original source stays around the embedded preview.
2. An occurrence highlight links the result to code.
3. The adjacent list switches the inspected location.

**Stopping rule for the proposed replay:** stop once the relevant call sites and their source are identified; do not use the caller tree to settle the separate value-origin oracle. Collapse branches when they no longer answer the query. Recursion, fan-out, keyboard traversal and narrow panes remain hands-on evaluation gaps.

#### What the protocol actually preserves

LSP separates seed preparation from incoming/outgoing expansion. An item has a URI, whole-symbol range, selected range and optional opaque data. A relation can retain multiple source occurrence ranges. Providers expose capability support, and the VS Code API passes cancellation tokens. Incoming/outgoing requests can stream partial batches. None of these fields supplies a predicate proving a feasible value path or a same-invocation relation. [IDE13] · [IDE14]

**Source inspection, Pyright 1.1.414:** outgoing lookup resolves named/member/property calls, groups destinations while retaining `fromRanges`, and can include multiple declaration/accessor candidates. Incoming lookup considers user/open files. Source-origin labels distinguish workspace, library and typeshed. This is implementation evidence, not a Pylance binary test. [IDE27]

#### Transfer and failure

A Srcly summary can copy the **occurrences remain inspectable** property without adopting the LSP contract wholesale. Preserve the query generation and raw relation/context IDs too. Make a root-level direction switch read “Sources of selected value” or “Uses of selected value”; offer a distinct “Investigate this row” action to reroot. This avoids confusing the root with the current highlight.

VS Code issue #190116 records exactly that root-versus-selected-node confusion. It was closed after failing the project's vote threshold. This is a concrete failure report, not an experiment and not evidence the proposed change is unusable. [IDE23]

Pylance issue #7910 recorded noise from mixing workspace and library callees. It is now closed with a fixed-in-next-version label. Treat it as **historical motivation with a concrete repair**, not an unfixed current defect. [IDE26]

**Poor fit:** a call tree cannot establish that an argument is returned, saved, ignored, or used only to choose a branch. Replacing Srcly's value analysis with a generic language-server call hierarchy is rejected. A call tree remains a useful contextual expansion around a value witness.

#### Authored replay fixture and hand oracle

Use these separate TS and Python source files; select `identity` and compare caller navigation with references. Then ask where `first` comes from. The call tree should not itself be accepted as a value-flow proof.

```ts
function identity(value: string): string { return value; }
function consume(value: string): void { console.log(value); }
const first = identity("A");
const second = identity("B");
consume(first);
```

```python
def identity(value: str) -> str:
    return value

def consume(value: str) -> None:
    print(value)

first = identity("A")
second = identity("B")
consume(first)
```

**Hand oracle:** both calls reference the same declaration, but the `consume(first)` value comes from `"A"`, not `"B"`. The call-site occurrence list can help distinguish sites; it does not encode the argument/return pairing required to prove the value answer. Record every provider's actual result and environment separately.

### Case 3 — Eclipse JDT: caller evidence, constructor context and reversible exploration

**Evidence mode:** current official documentation and an inspected official figure retained by that documentation. **Question:** “What reaches this callback method, and where is its receiver created?” **Language/input:** Java member in a configured JDT project/classpath. **Direction:** caller or callee tree. **Default scope:** displayed scope must be recorded; use explicit workspace/project/working set during evaluation.

#### Reproducible documented sequence

1. Select a method; invoke **Navigate → Open Call Hierarchy** (`Ctrl+Alt+H` in the documented keymap).
2. Expand a caller chain while retaining the original method root. For an anonymous-class or `Runnable` method, inspect **Expand with Constructors**, which separates construction from direct callers. [IDE18]
3. Set caller scope/search filters, select read/write field accesses as appropriate, and switch direction. Cancel a long search rather than waiting indefinitely. Refresh can target a subtree. [IDE17]
4. Open the selected source; return to the retained Call Hierarchy view. Use its **History List** to recover an earlier query or pin it before starting another. [IDE17]

#### Figure and annotations

![Official Eclipse caller tree with constructor expansion](https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/tips/images/call_hierarchy.png)

**Figure 4.** Historical-looking official figure retained in current JDT tips; not current styling evidence. [IDE18]

1. **Header:** names the root `runTest()` and displayed workspace scope.
2. **Tree spine:** nesting preserves the caller chain through `runBare()` and `protect()`.
3. **Special child labels:** `[constructor]` and `[callers]` make the relationship type explicit instead of drawing an undifferentiated arrow.
4. **Toolbar:** visible direction/history affordances are part of a stable view around the tree.

#### Interpretation and Srcly transfer

The constructor option is particularly instructive for callbacks. How a callable object is made and how its method is invoked answer different questions. In Srcly a resource callback may transmit the value and determine when downstream code runs. An expansion titled “Callback invocation / object identity” is more truthful than quietly inserting a callback parameter into a producer chain.

The Java mechanism does not supply JavaScript event-loop or Solid scheduling semantics. Srcly must attach a model/boundary label to framework edges and preserve invocation identity from its own engine. The proposed UI should distinguish “show related construction/registration evidence” from “extend this same value witness.” That distinction can be tested on the resource callback and two-call-site negative fixtures.

**Stopping rule for the proposed replay:** stop when construction, invocation and the source argument can be distinguished. Opening more callers is optional contextual exploration, not automatic proof that the value reaches every ancestor.

#### Incompleteness counterexample

JDT's search documentation describes potential matches when compile-time problems prevent resolution. Open maintainer issue #724 discusses an empty call hierarchy despite potential reference matches and proposes labelled inexact results. That means a blank call tree can be an epistemic failure, not proof no caller exists. Borrow the cancellation/history interface while keeping Srcly's stronger explicit unsupported, budget and stale outcomes. [IDE18] · [IDE24]

**Poor fit:** recursively unfolded trees can repeat the same shared method many times and make fan-in/out hard to compare. A retained root, duplicate indication and a bounded “show all witnesses for this relationship” interaction are preferable to expanding every recursive branch. Performance and orientation benefits remain proposed for Srcly.

#### Authored replay fixture and hand oracle

Create `CallbackExample.java`. Select the anonymous class's `run` declaration for **Open Call Hierarchy**, then toggle **Expand with Constructors**. Inspect source and return through the retained tree/history.

```java
final class CallbackExample {
  void save(String text) { System.out.println(text); }
  void launch(Runnable callback) { callback.run(); }
  void register() {
    Runnable callback = new Runnable() {
      public void run() { save("A"); }
    };
    launch(callback);
  }
}
```

**Hand oracle:** construction creates the callable object; `launch` invokes its method; the method passes `"A"` to `save`. Constructor evidence and call evidence are distinct. No asynchronous scheduler is present, so a replay result must not introduce async timing. For a follow-on framework case, replace `launch` with an opaque registration API and require the explanation to name that boundary.

## 3. Deep specialized workflows

### Case 4 — CodeQL: inspect a candidate path, then investigate where analysis stops

**Question:** can request input influence the filename passed to a file read? This is modeled taint influence, not exact value equality or an observation that the call ran. Value-preserving and taint propagation are different contracts. [SPC04] · [SPC05]

**Evidence:** docs, built-in query implementation and inspected official GitHub figure. The replay is unexecuted; no custom query is claimed to compile.

#### Proposed reproducible walkthrough

Prerequisites: an authorized CodeQL CLI/VS Code extension and matching JavaScript query pack. Use an isolated directory, not the Srcly checkout.

1. Create `fixture/example.js` with this authored HTTP-source case, or use the official query-help example. The request-source choice is deliberate: the built-in remote-input query should not be assumed to flag arbitrary command-line input. [SPC56]

   ~~~javascript
   const express = require("express");
   const fs = require("fs");
   const app = express();
   app.get("/open", (request, response) => {
     const selected = request.query.name;
     response.send(fs.readFileSync(selected, "utf8"));
   });
   ~~~

2. Create a new DB and record extractor/query-pack versions and source revision:

   ~~~sh
   codeql database create ./fixture-db --language=javascript-typescript --source-root=./fixture
   ~~~

   This JS extraction procedure does not require building the example. Initial extraction is a separate cost from querying. [SPC10]

3. Add/select the DB in the extension. Open `Security/CWE-022/TaintedPath.ql` inside the matching `codeql/javascript-queries` pack (upstream source path: `javascript/ql/src/Security/CWE-022/TaintedPath.ql`) and run it on the selected DB. The inspected upstream file identifies `js/path-injection`, a path result, and a deduplicated path graph; the exact installed pack must still be recorded. [SPC55]
4. Open a result, expand steps and inspect each source location. **Hand oracle:** if this handler is invoked with a chosen request name, that input determines the filename argument. A trace need not prove that a request occurs, the file exists, the read succeeds, or the path is exploitable in a particular deployment. [SPC07]
5. If empty, separately inspect source/sink selection and applicable library models. Bounded partial-flow exploration can diagnose where reachability stops; it is not the same as a finished whole-program answer. Record branch/exploration limits. [SPC09]
6. Return via query history, retaining query and DB identities. Stop the proposed replay when the input-to-filename witness and model assumptions are understandable; examine alternatives only when they change that answer. [SPC08]

#### Figure actually inspected

![Official GitHub code-scanning path alternatives](https://docs.github.com/assets/cb-340783/images/help/repository/multiple-paths-available.png)

**Figure 5.** Inspected official **GitHub web UI**, related CodeQL presentation evidence; not a screenshot of the VS Code replay. Figure build is unspecified. [SPC13]

Annotations:

1. Numbered source-linked steps represent the selected witness.
2. The selector distinguishes a 12-step witness from two 14-step alternatives.
3. File/line and expression highlights anchor each step; alternatives remain separately selectable.

**Inference for Srcly:** give each witness its own identity; selected path length and alternative count must mean exactly what was enumerated. Do not infer “all feasible paths” from a menu of reported alternatives. Query identity and generation belong with the explanation. A graph may give a better branch overview; a ledger is better at ordered source checking but can make convergence and repeated branches harder to see.

**Unverified UI properties:** no hands-on evidence for keyboard order, narrow-screen ergonomics, stable layout, cancellation response, or current extension latency. Global call/field sensitivity is library dependent; no claim of full path feasibility or complete alias reasoning is made.

### Case 5 — Semgrep: a concise trace is intentionally selective

**Evidence:** official docs and inspected historical figure; no scan or UI interaction. **Developer question:** “Which input contributes to this save call?” The rule chooses the source and sink vocabulary. This makes scope understandable, but a result only speaks to those patterns and the selected engine mode. [SPC14]

#### Proposed reproducible walkthrough

Use CE first for a local Python fixture; the comparison does not require a Pro account.

Create fixture.py:

~~~python
def candidate():
    incoming = read_input()
    first = incoming
    second = incoming
    save(first + second)
~~~

Create trace.yml:

~~~yaml
rules:
  - id: explain-input-save
    message: Candidate input reaches save
    severity: WARNING
    languages: [python]
    mode: taint
    pattern-sources:
      - pattern: read_input(...)
        exact: true
    pattern-sinks:
      - pattern: save(...)
~~~

Run, as a proposed command:

~~~sh
semgrep scan --config trace.yml --dataflow-traces fixture.py
~~~

1. Inspect the reported sink, then the source/intermediate trace.
2. Record which route is shown. Do not interpret one trace as evidence that the other assignment is unrelated.
3. For the exact official multiple-route demonstration, open the taint-overview page's Playground example, run it, and inspect Matches/dataflow. Follow the documented change that removes one route and inspect the remaining trace. This is a documentation-backed procedure, not an executed Playground session. [SPC14]
4. Move a transfer across a function or file only as a separate experiment. Record CE, Pro intrafile, or Pro interfile explicitly. A zero-result comparison across different scopes is not a correctness benchmark. [SPC17]
5. Keep the original source selection and result identifier when opening the trace's code. The CLI trace flag affects text/SARIF; do not expect equivalent detail from JSON solely because that flag is present. [SPC16]

#### Figure actually inspected

![Official Semgrep cross-file dataflow trace](https://semgrep.dev/assets/screenshot-2025-04-02-at-2.32.07-pm.png)

**Figure 6.** Official update dated **April 2, 2025**, directly retrieved and visually inspected; also present in the Spring 2025 kit, page 7. Historical UI evidence, not a 2026 app session. [SPC20] · [SPC21]

Annotations:

1. Vertical cards retain line numbers and expression highlights.
2. The **Java** example crosses from an argument through construction into a parameter/field.
3. File transitions are explicit.
4. Clean visual ordering does not prove a full execution predicate or alias identity.

**Stopping and return:** for this proposed local replay, stop after identifying a displayed route and checking whether a second route matters. Preserve the rule, engine mode and source revision with results; use the editor's ordinary source navigation to return. A product-specific history/undo contract for the trace was not verified. A zero result, unsupported syntax, mode boundary and timeout must be recorded separately.

#### Semantics that matter to Srcly

Field paths are tracked per variable, not abstract heap object. Pro control/path options and explicit side-effect modeling make blanket “path-insensitive” descriptions inaccurate. A documented older syntactic side-effect workaround could mishandle sanitization and branches. [SPC15] [SPC16]

**Inference:** concise source-linked cards are worth testing, but the top of a Srcly ledger should say whether it is one explanation, a set of local transfers, or an exhaustive result under a stated model. “Condition not analyzed” is a material statement, not an empty cell. A compact trace can lose by suppressing a second route that changes the developer's answer.

### Case 6 — Joern: separate data questions from conditions and model assumptions

**Evidence:** official docs/transcript and frontend/model documentation; no shell executed. **Developer question:** “Which main input reaches this comparison, and what condition controls the relevant operation?” Joern exposes these as related but distinct graph traversals. [SPC24] · [SPC25] · [SPC26] · [SPC27]

#### Proposed reproducible walkthrough

Prerequisites: a separately installed Joern release and JDK compatible with it. Use the official x42 fixture rather than Srcly. The docs' examples span releases; record actual frontend/version before running.

~~~sh
git clone https://github.com/ShiftLeftSecurity/x42.git
joern
~~~

In its shell:

~~~scala
importCode(inputPath="./x42/c", projectName="x42-c")
def inputs = cpg.method.name("main").parameter
def checks = cpg.call.name("strcmp").argument
checks.reachableBy(inputs).l
checks.reachableByFlows(inputs).p
~~~

1. Confirm import created the intended project, not an empty/failed result.
2. Compare reachableBy's source set with reachableByFlows' ordered path output.
3. Inspect the table's tracked expression, line, method and file for each step; use the source location to return to the fixture.
4. Query the documented control example separately:

   ~~~scala
   cpg.call.codeExact("exit(42)").controlledBy.code.l
   ~~~

   Keep a controlling expression distinct from a value source or an assumed fully feasible path condition. [SPC25] [SPC26]
5. If the needed dataflow overlay is absent, the documented export workflow adds ossdataflow; establish the selected release's actual import defaults before adding overlays. Exported AST/CFG/PDG graphs are separate representations, not a guarantee that every edge is the same relation. [SPC31]
6. When a path crosses an external function, inspect the applicable semantics rather than treating an all-argument transfer as a concrete assignment. Default semantics can propagate from every argument to other arguments and the return. Supplying custom semantics kills unspecified flows, so an incorrect custom model can hide a real relationship. [SPC27]

**Hand oracle for the official C fixture:** the first supplied argument reaches the string comparison; the special exit is conditional on an argument existing and matching the expected text. This separates data input from execution permission. [SPC26]

**Stopping and return:** first compare the source set and one returned path; then ask the control question separately. Keep the CPG/project identity and query text beside results. Shell-history durability, undo, deep links, interactive cancellation and current graphical source-preview behavior were not verified. A failed import, missing overlay, modeled external transfer and empty successful query are distinct outcomes.

#### Official evidence and accessibility limit

The inspected data-flow documentation provides a source-to-sink REPL table with node type, tracked text, line number, method and file. That is **official transcript inspection**, not a personally exercised shell. No independently accessible official interactive flow screenshot was obtained for this case; the documented table is the UI evidence. Do not fabricate an app screenshot. [SPC25]

**Inference:** Srcly can borrow a source-witness table and separate “what permits it?” expansion without adopting a CPG store or Scala query language. The table is excellent for explicit evidence and poor at helping a novice discover the right traversal. A full CPG would add extraction, model, index and query maintenance before proving that the local UI needs them.

**Relevance and limits:** JS/TS and Python frontends expose type-recovery and scope/import controls; their precise cross-language field/context/flow guarantees were not established. The C example does not validate TSX reactive callback models or Python closure semantics. Slice commands can export backward dataflow/usage views, but those exports do not supply independent correctness evidence. [SPC28] · [SPC29] · [SPC30]

### Case 7 — Understand: preserve exact evidence behind an aggregate edge

**Evidence:** official docs and inspected figure; no application session. **Developer question:** “Why does this file/architecture depend on that one?” This is a structural/reference question, not automatically “which value reaches this result?” Dependencies are computed from language-specific references and rolled up through containing entities. Options alter what kinds count; some C-family indirect calls are excluded. [SPC32]

#### Proposed reproducible click sequence

Prerequisite: an analyzed project in a compatible Understand build.

1. Select an analyzed entity → **View Dependencies**; Shift opens another window.
2. Choose direction, expand a count to exact references, then open source.
3. Use reference mode or graph control for the same selection. [SPC33]
4. For an entity graph, choose Graphical Views and a directional or Butterfly variant. Record each wing's depth. Use the matrix only when comparing dense structural coupling, not to narrate a value's ordered history. [SPC33] [SPC34]

#### Official screenshot actually inspected

![Official Understand dependency browser](https://docs.scitools.com/help/assets/screenshots/dependencies/dependency-browser.png)

**Figure 7.** Official browser figure; docs dated **July 28, 2026**. [SPC33]

Annotations:

1. Title retains scope/direction.
2. Aggregates have occurrence counts.
3. Expanded group exposes two include locations.
4. Other references remain grouped.

**Stopping and return:** stop the proposed replay when the relevant aggregated dependency is explained by its source references. Keep that selection when switching representations. General history, undo, keyboard focus and narrow-pane behavior were not verified. Parse/configuration gaps must not be reported as zero dependencies.

**Transfer:** a Srcly edge should own a list of contributing raw relation IDs, not merely an endpoint pair. Source evidence, relation kind, model/proof, hidden relations and generation must remain recoverable. Expanding an aggregate should restore its members; it should not manufacture an ordered cross-context path from those members.

**Why this may lose:** counts can imply false precision if they combine different relation kinds or duplicate witnesses. A reference browser is a poor answer to a value-origin question until the relation vocabulary and context are explicit. “23 references” is useful only if the unit and scope of 23 are explained.

## 4. Additional independent mechanisms

### Visual Studio: member grouping with an explicit call-site pane

**Evidence:** docs and inspected figure. Select a member → **View Call Hierarchy**, expand a direction, select a child and inspect source occurrences. Scope, reroot and source-jump actions are documented; refresh collapses the node. [IDE20]

![Official Visual Studio call hierarchy and call-site pane](https://learn.microsoft.com/en-us/visualstudio/ide/media/call-hierarchy-cpp.png?view=vs-2022)

**Figure 8.** Official `vs-2022` figure; current binary parity untested. [IDE20]

1. Scope remains visible.
2. Incoming/outgoing branches are separate.
3. Occurrence/location pane is currently empty.

**Srcly inference:** a folded edge should open contributing witnesses, not only endpoint details. The question “could the framework invoke this callback?” requires a contract broader than an explicit call-site lookup. A missing explicit call cannot settle it.

Debugger data breakpoints add a different answer: run a supported program, break at a change, then inspect the live stack and values. This is observation of that run, not a complete static dependency set. Incorporating runtime evidence into Srcly would require a run identity and instrumentation contract, and is not needed to test its first source-explanation slice. [IDE21]

### rust-analyzer: analysis architecture and a caution about names

The inspected `2026-10-26` source is unusually useful because it makes the boundary explicit. `incoming_calls` finds references to the selected function, then groups them by containing function. In that routine it does not restrict those references to call-expression syntax. `outgoing_calls` separately walks callable expressions and resolves supported callable kinds or methods. `CallLocations` groups navigation targets and keeps multiple ranges. This is source inspection only, not an executed behavioral test. [IDE28]

Its architecture separates a transactionally updated host from an immutable analysis snapshot, computes derived facts on demand and cancels obsolete work after input revisions. Srcly can reuse the principle of **all expansion belongs to the original generation** without importing Rust's crate, type, borrow or macro model. Crate dependencies, symbol references and function-call candidates should stay separate answer types. [IDE29] · [IDE30] · [IDE31]

The useful counterexample is an identical screen widget fed by a different semantic contract. A provider label or relation kind must survive into Srcly's view model. An endpoint pair alone is insufficient to explain what a line means.

## 5. What transfers to Srcly, and what should be rejected

The pinned repository checks found a concrete reason to favor evidence preservation before a new graph style: the client adapter folds endpoints, removes references and keeps one displayed edge per endpoint pair; the engine anchor graph also deduplicates some endpoint pairs before the client receives them. A later inspector cannot recover records already discarded upstream. The context-aware traversal and its exported relation union must not be treated as interchangeable guarantees. These are repository facts, not vendor comparisons. [SRC-A] [SRC-B] [SRC-C]

| External mechanism | Srcly disposition and prerequisite | Decision that can reject it |
| --- | --- | --- |
| Understand/Visual Studio: aggregate → contributing occurrences | **Adopt for a bounded proof:** retain raw relation IDs, invocation/context evidence where produced, hidden members, status and generation. First present a local connection explanation, not a certified multi-hop path. | Reject if any member is lost, count units mix silently, source anchors drift or a relation from one invocation is joined to another. |
| IntelliJ / VS Code / Eclipse: rooted source-oriented tree | **Investigate as a competing view:** preserve query root, separate reroot from direction, make source return explicit. | Retain the baseline graph if source rows increase orientation errors or interactions without more correct answers. |
| CodeQL / Semgrep: selected witness plus alternatives | **Investigate after context compatibility survives the contract.** Distinguish one reported witness, local relation bundles and exhaustive claims. | Reject if omitted alternatives change the answer, execution conditions disappear or a clean sequence invents feasibility. |
| Joern: value and condition questions are separate | **Adopt the vocabulary; scope new analysis separately.** A missing condition remains visible as unresolved. | Reject a producer view when users infer an unconditional write from a conditional save or callback. |
| LSP / rust-analyzer: deferred query and cancellation | **Reuse existing generation/cancellation direction; extend missing expansion identity.** Transport batches, scope limits and semantic boundaries remain different states. | Reject stale merges or cancellation rendered as empty success. Require separate analysis/render latency measurements. |
| Sourcegraph: indexed versus fallback evidence | **Borrow explicit evidence-mode labels. Defer service infrastructure.** Query revision and coverage remain inspectable. | Reject a mode label that is ornamental while missing analysis is still read as no dependency. |
| dependency-cruiser / Madge: module scope, warnings and focus | **Use for import questions only; reuse owned boundary work.** Rendering focus and analysis scope are named separately. | Reject a module route presented as value propagation or an unresolved import counted as zero. |
| NDepend matrix / Sourcetrail coordinated views | **Defer matrix; retain shared-selection idea.** Dense architectural comparison differs from ordered value explanation. | Reject representation switches that silently change query, scope or evidence. |
| Full Joern CPG, enterprise navigation service, runtime instrumentation | **Reject as the first slice.** Prove the local evidence contract and task benefit before new infrastructure. | Reconsider only if missing analysis facts and measured task demand justify extraction/storage/model maintenance. |

These dispositions extend the existing graph/inspector and contract work; they do not approve integration or displace the audit's already-owned folding, gap wording, action traversal and first-query latency work. The smallest proposed comparison retains the current folded UI as baseline, adds an exact-evidence connection inspector, and compares that with producer-first and source-first presentations. Codex owns implementation and must reconcile later commits separately.

### Where presentations lose

A folded graph communicates branches, convergence and architectural context, but visible reachability is weaker than a compatible raw witness. A tree supports local reversible expansion but duplicates shared nodes and needs cycle/back-reference treatment. A ledger supports ordered source checking only when ordering is justified; otherwise it must remain an unordered relation bundle. A producer-first view can hide the condition or identity fact that explains the bug. A matrix helps compare structural coupling but cannot narrate a value. A runtime timeline describes recorded execution and needs run/capture identity. None wins simply by showing fewer boxes.

Thin Slicing and Whyline are research context, not extra product counts. The separate research report evaluates their original papers and evidence limits. This survey does not import Java pointer assumptions, simulated inspection ratios or runtime capture semantics into Srcly. [SPC01] · [SPC54]

## 6. Evidence limits and reproducibility checklist

**Actually performed here:** primary documentation/release/maintainer research; official-image retrieval and visual inspection; Pyright and rust-analyzer routine inspection; Joern official transcript inspection. **Not performed:** external-tool installation, indexing/extraction, query compilation, scans, app clicking, keyboard/narrow-screen tests, timing comparisons or participant study. None of the proposed workflows is labelled hands-on.

Before a later replay, record the source revision, tool/extension/frontend/query-pack build, language/environment, exact selected range, root/direction/scope, model/library configuration, cold versus warm state and cancellation/budget. Save the first result, one meaningful expansion, selected source and return state. Record unsupported, stale, cancelled, truncated and empty-success outcomes separately. Apply the hand-labelled value and condition oracles even when the product exposes only references or callers.

Default relevance ordering, complete keyboard accessibility, color-independent meaning, stable expansion layout and narrow-screen ergonomics were not verified across tools. The figures reveal source labels and structural arrangements; they are insufficient to certify those qualities. Vendor documentation and maintainer issue reports are not independent comparative usability studies. Current-release verification does not make a historical screenshot current.

A failure report is useful without overstating it: VS Code's root/direction complaint was closed by its voting policy; Pylance's origin-noise report is now closed/fixed; Eclipse's potential-reference discrepancy remains an open issue in retrieved evidence; Sourcetrail is archived. These are different statuses and provide different kinds of design evidence. [IDE23] · [IDE24] · [IDE26] · [SPC42]

## 7. Primary reference key

Every link below is a primary vendor, maintainer, implementation or original-research source. **Retrieval: 2026-10-28 America/Indianapolis.** Edition/build and figure dates are recorded next to the relevant claim; undated pages are current retrieved documentation, not a fixed released implementation. Source IDs are stable across this assignment. Repository sources below remain pinned to the specified baseline.

- **IDE01 — IntelliJ IDEA: Analyze data flow.** IntelliJ IDEA 2026.2 help; 2026-08-14. Evidence: documentation + inspected official figure. <https://www.jetbrains.com/help/idea/analyzing-data-flow.html>
- **IDE02 — IntelliJ IDEA: Source code hierarchy.** 2026.2 help. Evidence: documentation. <https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html>
- **IDE03 — WebStorm: Source code hierarchy.** 2026.2 help; 2026-08-17. Evidence: documentation. <https://www.jetbrains.com/help/webstorm/viewing-structure-and-hierarchy-of-the-source-code.html>
- **IDE04 — WebStorm: Search for usages.** 2026.2 help; 2026-09-09. Evidence: documentation + inspected official figure. <https://www.jetbrains.com/help/webstorm/find-highlight-usages.html>
- **IDE05 — WebStorm feature request WEB-28992.** Submitted state in retrieved current official search result. Evidence: primary tracker search evidence. <https://youtrack.jetbrains.com/projects/WEB/issues/WEB-28992/Support-Analyze-Data-Flow-to-here-from-here-actions-in-Typescript-JavaScript>
- **IDE06 — IntelliJ IDEA: Dependencies analysis.** 2026.2 help. Evidence: documentation. <https://www.jetbrains.com/help/idea/dependencies-analysis.html>
- **IDE07 — PyCharm: Source code hierarchy.** 2026.2 help; 2026-08-17. Evidence: documentation. <https://www.jetbrains.com/help/pycharm/viewing-structure-and-hierarchy-of-the-source-code.html>
- **IDE08 — VS Code current release.** 1.144.0 stable; 2026-10-28. Evidence: release documentation. <https://code.visualstudio.com/updates/v1_144>
- **IDE09 — VS Code: Code Navigation.** living docs retrieved 2026-10-28. Evidence: documentation + inspected official figure. <https://code.visualstudio.com/docs/editing/editingevolved>
- **IDE10 — TypeScript: Announcing TypeScript 3.8.** 2020 introduction. Evidence: maintainer explanation. <https://devblogs.microsoft.com/typescript/announcing-typescript-3-8/>
- **IDE11 — VS Code 1.43 release: JS/TS call hierarchy.** February 2020 / VS Code 1.43; TS 3.8. Evidence: documentation + inspected official figure. <https://code.visualstudio.com/updates/v1_43>
- **IDE12 — VS Code: Editing Python.** living docs retrieved 2026-10-28. Evidence: documentation. <https://code.visualstudio.com/docs/python/editing>
- **IDE13 — LSP 3.17: Call hierarchy specification source.** LSP 3.17; feature since 3.16. Evidence: specification source inspection. <https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md>
- **IDE14 — VS Code API: CallHierarchyProvider.** living API docs retrieved 2026-10-28. Evidence: API documentation. <https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider>
- **IDE15 — Pylance: python.analysis.indexing.** living docs retrieved 2026-10-28. Evidence: documentation. <https://github.com/microsoft/pylance-release/blob/main/docs/settings/python_analysis_indexing.md>
- **IDE16 — VS Code: Python settings reference.** living docs retrieved 2026-10-28. Evidence: documentation. <https://code.visualstudio.com/docs/python/settings-reference>
- **IDE17 — Eclipse JDT: Call Hierarchy View.** current latest help retrieved 2026-10-28. Evidence: documentation. <https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm>
- **IDE18 — Eclipse JDT: Tips and Tricks.** current latest help; historical screenshot retained. Evidence: documentation + inspected official figure. <https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/tips/jdt_tips.html>
- **IDE19 — Eclipse 2026-09 (4.41) release.** 2026-09 / 4.41. Evidence: release documentation. <https://eclipseide.org/release/noteworthy/2026-09/>
- **IDE20 — Visual Studio: View call hierarchy.** workflow page dated 2025-09-23; version-labelled vs-2022 view. Evidence: documentation + inspected official figure. <https://learn.microsoft.com/en-us/visualstudio/ide/call-hierarchy?view=vs-2022>
- **IDE21 — Visual Studio: Use the right type of breakpoint.** living docs retrieved 2026-10-28. Evidence: documentation. <https://learn.microsoft.com/en-us/visualstudio/debugger/using-breakpoints?view=vs-2022>
- **IDE22 — Visual Studio 2026 release notes.** 18.11.2; 2026-10-25. Evidence: release documentation. <https://learn.microsoft.com/en-us/visualstudio/releases/2026/release-notes>
- **IDE23 — VS Code issue #190116: direction switch root confusion.** opened 2023-08-10; closed not planned 2023-10-10. Evidence: primary failure report and disposition. <https://github.com/microsoft/vscode/issues/190116>
- **IDE24 — Eclipse JDT issue #724: inexact call matches.** opened 2023-02-10; open when retrieved. Evidence: maintainer/contributor issue discussion. <https://github.com/eclipse-jdt/eclipse.jdt.core/issues/724>
- **IDE25 — Pylance issue #4102: calls versus imports/navigation.** 2023 maintainer discussion. Evidence: primary maintainer issue explanation. <https://github.com/microsoft/pylance-release/issues/4102>
- **IDE26 — Pylance issue #7910: workspace/library call noise.** 2026-02-27; closed/fixed-in-next-version label retrieved. Evidence: primary issue and resolution status. <https://github.com/microsoft/pylance-release/issues/7910>
- **IDE27 — Pyright callHierarchyProvider.ts.** Pyright 1.1.414; release 2026-09-09. Evidence: public implementation inspection. <https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts>
- **IDE28 — rust-analyzer call_hierarchy.rs.** 2026-10-26 / v0.3.3097. Evidence: public implementation inspection. <https://github.com/rust-lang/rust-analyzer/blob/2026-10-26/crates/ide/src/call_hierarchy.rs>
- **IDE29 — rust-analyzer architecture.** living architecture docs retrieved 2026-10-28. Evidence: maintainer design documentation. <https://rust-analyzer.github.io/book/contributing/architecture.html>
- **IDE30 — rust-analyzer features.** living docs retrieved 2026-10-28. Evidence: documentation. <https://rust-analyzer.github.io/book/features.html>
- **IDE31 — rust-analyzer 2026-10-26 release.** 2026-10-26 / v0.3.3097; commit prefix 0c4d746. Evidence: release documentation. <https://github.com/rust-lang/rust-analyzer/releases/tag/2026-10-26>
- **IDE32 — Pylance stable release metadata.** stable 2026.4.1 published 2026-09-23T21:36:53Z. Evidence: public GitHub release API inspection. <https://api.github.com/repos/microsoft/pylance-release/releases/latest>
- **IDE33 — Register IntelliJ IDEA.** 2026.2 help. Evidence: official access documentation. <https://www.jetbrains.com/help/idea/register.html>
- **IDE34 — Register WebStorm.** 2026.2 help. Evidence: official access documentation. <https://www.jetbrains.com/help/webstorm/register.html>
- **IDE35 — Register PyCharm.** 2026.2 help. Evidence: official access documentation. <https://www.jetbrains.com/help/pycharm/register.html>
- **IDE36 — rust-analyzer README license.** current repo docs at retrieval. Evidence: source/license declaration. <https://github.com/rust-lang/rust-analyzer/blob/master/README.md>
- **IDE37 — Eclipse IDE official home.** current at retrieval. Evidence: official product/access documentation. <https://eclipseide.org/>
- **IDE38 — Visual Studio Community.** current at retrieval. Evidence: official product/access documentation. <https://visualstudio.microsoft.com/vs/community/>
- **IDE39 — IntelliJ source navigation.** 2026.2 help. Evidence: documentation. <https://www.jetbrains.com/help/idea/navigating-through-the-source-code.html>
- **IDE40 — Pylance changelog.** latest retrieved prerelease 2026.4.101, 2026-10-15. Evidence: official changelog inspection. <https://raw.githubusercontent.com/microsoft/pylance-release/main/CHANGELOG.md>
- **IDE41 — Pylance README.** current repo docs at retrieval. Evidence: official repository documentation. <https://github.com/microsoft/pylance-release>
- **IDE42 — VS Code license.** current terms at retrieval. Evidence: official access documentation. <https://code.visualstudio.com/license>
- **IDE43 — Editing TypeScript in VS Code.** current docs at retrieval. Evidence: documentation. <https://code.visualstudio.com/docs/typescript/typescript-editing>
- **SPC01 — Thin Slicing (Sridharan, Fink, Bodík), PLDI 2007.** PLDI 2007; sections 2–6. Evidence: Original paper; PDF text and figures inspected. <https://manu.sridharan.net/files/pldi07.pdf>
- **SPC04 — Analyzing data flow in JavaScript and TypeScript.** Current docs; modular API. Evidence: Official documentation. <https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/>
- **SPC05 — About data flow analysis.** Current docs. Evidence: Official documentation. <https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/>
- **SPC06 — Creating path queries.** Modular API introduced in CodeQL 2.13. Evidence: Official documentation. <https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/>
- **SPC07 — Explore data flow with CodeQL for VS Code.** Current docs. Evidence: Official documentation; workflow reconstruction, not exercised. <https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/explore-data-flow>
- **SPC08 — Running CodeQL queries.** Current docs. Evidence: Official documentation. <https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/running-codeql-queries>
- **SPC09 — Debugging data-flow queries using partial flow.** Current docs. Evidence: Official documentation. <https://codeql.github.com/docs/writing-codeql-queries/debugging-data-flow-queries-using-partial-flow/>
- **SPC10 — Prepare code for CodeQL analysis.** Current CLI documentation. Evidence: Official documentation. <https://docs.github.com/en/code-security/tutorials/customize-code-scanning/prepare-code-for-analysis>
- **SPC11 — CodeQL CLI releases.** Reviewed v2.27.3, 2026-10-20. Evidence: Maintainer release page. <https://github.com/github/codeql-cli-binaries/releases>
- **SPC12 — CodeQL for VS Code repository.** Repository inspected on retrieval date. Evidence: Primary implementation/readme/license inspection. <https://github.com/github/vscode-codeql>
- **SPC13 — Assess code scanning alerts / multiple paths figure.** Current docs; image version not stated. Evidence: Official UI screenshot actually downloaded and visually inspected. <https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assess-alerts>
- **SPC14 — Semgrep taint analysis overview.** Current docs. Evidence: Official documentation. <https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview>
- **SPC15 — Semgrep advanced taint analysis.** Current docs. Evidence: Official documentation. <https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced>
- **SPC16 — Semgrep CLI reference.** Current docs. Evidence: Official documentation. <https://docs.semgrep.dev/cli-reference>
- **SPC17 — Semgrep Pro Engine introduction.** Current docs. Evidence: Official documentation. <https://docs.semgrep.dev/semgrep-code/semgrep-pro-engine-intro>
- **SPC18 — Semgrep releases.** Reviewed v1.182.0, 2026-10-20. Evidence: Maintainer release page. <https://github.com/semgrep/semgrep/releases>
- **SPC19 — Semgrep repository.** Repository inspected on retrieval date. Evidence: Primary implementation/readme/license inspection. <https://github.com/semgrep/semgrep>
- **SPC20 — Semgrep spring 2025 release marketing kit.** Spring 2025; page 7. Evidence: Official UI figure actually rendered and visually inspected. <https://semgrep.dev/assets/release-marketing/spring-2025-semgrep-release-marketing-kit.pdf>
- **SPC21 — In-app snippets for cross-file dataflow traces.** 2025-04-02. Evidence: Official product update and official screenshot downloaded and visually inspected. <https://semgrep.dev/products/product-updates/in-app-code-snippets-are-now-supported-for-cross-file-dataflow-traces/>
- **SPC22 — Joern releases.** Reviewed v4.0.666, 2026-10-27, commit 346d3e6. Evidence: Maintainer release page. <https://github.com/joernio/joern/releases/>
- **SPC23 — Joern repository.** Repository inspected on retrieval date. Evidence: Primary implementation/readme/license inspection. <https://github.com/joernio/joern>
- **SPC24 — Joern quickstart.** Current docs; x42 C fixture. Evidence: Official documentation and REPL transcript inspection. <https://docs.joern.io/quickstart/>
- **SPC25 — Joern data-flow steps.** Current docs. Evidence: Official documentation and tabular REPL output inspected. <https://docs.joern.io/cpgql/data-flow-steps/>
- **SPC26 — Joern control-flow steps.** Current docs. Evidence: Official documentation. <https://docs.joern.io/cpgql/control-flow-steps/>
- **SPC27 — Joern custom data-flow semantics.** Current docs. Evidence: Official documentation. <https://docs.joern.io/dataflow-semantics/>
- **SPC28 — Joern CPG slicing.** Current docs; some prerequisite text older than release. Evidence: Official documentation. <https://docs.joern.io/cpg-slicing/>
- **SPC29 — Joern JavaScript frontend.** Current jssrc2cpg docs. Evidence: Official documentation. <https://docs.joern.io/frontends/javascript/>
- **SPC30 — Joern Python frontend.** Current pysrc2cpg docs. Evidence: Official documentation. <https://docs.joern.io/frontends/python/>
- **SPC31 — Joern graph export.** Current docs. Evidence: Official documentation. <https://docs.joern.io/export/>
- **SPC32 — Understand: what are dependencies?.** Understand 8 documentation. Evidence: Official documentation. <https://docs.scitools.com/help/dependencies/what-are-dependencies.html>
- **SPC33 — Understand: browse and export dependencies.** Understand 8 documentation. Evidence: Official documentation; official UI screenshot actually downloaded and visually inspected. <https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html>
- **SPC34 — Understand: open a graph.** Understand 8 documentation. Evidence: Official documentation. <https://docs.scitools.com/help/graphs/open-a-graph.html>
- **SPC35 — Understand build notes.** Reviewed Understand 8.0 build 1265, 2026-10-09. Evidence: Maintainer release notes. <https://docs.scitools.com/buildnotes/>
- **SPC36 — Understand supported languages.** Current docs. Evidence: Official documentation. <https://docs.scitools.com/help/getting-started/supported-languages.html>
- **SPC37 — Understand open-source license.** Available from build 1258. Evidence: Official licensing documentation. <https://docs.scitools.com/help/licensing/open-source-license.html>
- **SPC38 — Sourcegraph code navigation.** Current docs. Evidence: Official documentation. <https://sourcegraph.com/docs/code-navigation>
- **SPC39 — Sourcegraph precise code navigation.** Current docs; Enterprise feature. Evidence: Official documentation. <https://sourcegraph.com/docs/code-navigation/precise-code-navigation>
- **SPC40 — Sourcegraph 8.1.0 release.** 2026-10-14; newer 8.1.1335 linked. Evidence: Maintainer release notes. <https://sourcegraph.com/changelog/releases/8.1.0>
- **SPC41 — Sourcegraph latest changelog.** 2026-10-26 entries reviewed. Evidence: Maintainer release notes. <https://sourcegraph.com/changelog/latest>
- **SPC42 — Sourcetrail repository.** Archived 2021-12-14; historical 2021.4. Evidence: Primary archived implementation/readme/license inspection. <https://github.com/CoatiSoftware/Sourcetrail>
- **SPC43 — Sourcetrail documentation.** 2021.4 historical docs. Evidence: Official archived documentation. <https://github.com/CoatiSoftware/Sourcetrail/blob/master/DOCUMENTATION.md?plain=1>
- **SPC44 — NDepend dependency structure matrix.** Current docs. Evidence: Official documentation and documented UI behavior. <https://www.ndepend.com/docs/dependency-structure-matrix-dsm/>
- **SPC45 — NDepend analysis inputs.** Current docs. Evidence: Official documentation. <https://www.ndepend.com/docs/ndepend-analysis-inputs-explanation>
- **SPC46 — NDepend purchase and access.** Current page. Evidence: Official pricing/licensing page. <https://www.ndepend.com/purchase>
- **SPC47 — NDepend release notes.** Reviewed 2026.1.6, 2026-06-01. Evidence: Maintainer release notes. <https://www.ndepend.com/release-notes>
- **SPC48 — dependency-cruiser repository.** Repository inspected on retrieval date. Evidence: Primary implementation/readme/license inspection. <https://github.com/sverweij/dependency-cruiser>
- **SPC49 — dependency-cruiser options reference.** Current docs. Evidence: Official documentation. <https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md>
- **SPC50 — dependency-cruiser CLI reference.** Current docs. Evidence: Official documentation. <https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md>
- **SPC51 — dependency-cruiser releases.** Reviewed v18.6.0, 2026-10-11. Evidence: Maintainer release notes. <https://github.com/sverweij/dependency-cruiser/releases>
- **SPC52 — Madge repository.** Repository inspected on retrieval date. Evidence: Primary implementation/readme/license inspection. <https://github.com/pahen/madge>
- **SPC53 — Madge package manifest.** Reviewed manifest 8.0.0; Node >=18. Evidence: Primary package/license inspection. <https://github.com/pahen/madge/blob/master/package.json>
- **SPC54 — Whyline for Java (Ko and Myers), CHI 2009.** CHI 2009; author-hosted paper. Evidence: Original research paper inspected. <https://faculty.washington.edu/ajko/papers/Ko2009JavaWhylineUI.pdf>
- **SPC55 — CodeQL built-in JavaScript TaintedPath query.** Current primary source inspected. Evidence: Official documentation / implementation inspection. <https://github.com/github/codeql/blob/main/javascript/ql/src/Security/CWE-022/TaintedPath.ql>
- **SPC56 — CodeQL js/path-injection query help.** Current primary source inspected. Evidence: Official documentation / implementation inspection. <https://codeql.github.com/codeql-query-help/javascript/js-path-injection/>

[IDE01]: https://www.jetbrains.com/help/idea/analyzing-data-flow.html
[IDE02]: https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html
[IDE03]: https://www.jetbrains.com/help/webstorm/viewing-structure-and-hierarchy-of-the-source-code.html
[IDE04]: https://www.jetbrains.com/help/webstorm/find-highlight-usages.html
[IDE05]: https://youtrack.jetbrains.com/projects/WEB/issues/WEB-28992/Support-Analyze-Data-Flow-to-here-from-here-actions-in-Typescript-JavaScript
[IDE06]: https://www.jetbrains.com/help/idea/dependencies-analysis.html
[IDE07]: https://www.jetbrains.com/help/pycharm/viewing-structure-and-hierarchy-of-the-source-code.html
[IDE08]: https://code.visualstudio.com/updates/v1_144
[IDE09]: https://code.visualstudio.com/docs/editing/editingevolved
[IDE10]: https://devblogs.microsoft.com/typescript/announcing-typescript-3-8/
[IDE11]: https://code.visualstudio.com/updates/v1_43
[IDE12]: https://code.visualstudio.com/docs/python/editing
[IDE13]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/callHierarchy.md
[IDE14]: https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider
[IDE15]: https://github.com/microsoft/pylance-release/blob/main/docs/settings/python_analysis_indexing.md
[IDE16]: https://code.visualstudio.com/docs/python/settings-reference
[IDE17]: https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/reference/views/ref-call-hierarchy.htm
[IDE18]: https://help.eclipse.org/latest/topic/org.eclipse.jdt.doc.user/tips/jdt_tips.html
[IDE19]: https://eclipseide.org/release/noteworthy/2026-09/
[IDE20]: https://learn.microsoft.com/en-us/visualstudio/ide/call-hierarchy?view=vs-2022
[IDE21]: https://learn.microsoft.com/en-us/visualstudio/debugger/using-breakpoints?view=vs-2022
[IDE22]: https://learn.microsoft.com/en-us/visualstudio/releases/2026/release-notes
[IDE23]: https://github.com/microsoft/vscode/issues/190116
[IDE24]: https://github.com/eclipse-jdt/eclipse.jdt.core/issues/724
[IDE25]: https://github.com/microsoft/pylance-release/issues/4102
[IDE26]: https://github.com/microsoft/pylance-release/issues/7910
[IDE27]: https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/languageService/callHierarchyProvider.ts
[IDE28]: https://github.com/rust-lang/rust-analyzer/blob/2026-10-26/crates/ide/src/call_hierarchy.rs
[IDE29]: https://rust-analyzer.github.io/book/contributing/architecture.html
[IDE30]: https://rust-analyzer.github.io/book/features.html
[IDE31]: https://github.com/rust-lang/rust-analyzer/releases/tag/2026-10-26
[IDE32]: https://api.github.com/repos/microsoft/pylance-release/releases/latest
[IDE33]: https://www.jetbrains.com/help/idea/register.html
[IDE34]: https://www.jetbrains.com/help/webstorm/register.html
[IDE35]: https://www.jetbrains.com/help/pycharm/register.html
[IDE36]: https://github.com/rust-lang/rust-analyzer/blob/master/README.md
[IDE37]: https://eclipseide.org/
[IDE38]: https://visualstudio.microsoft.com/vs/community/
[IDE39]: https://www.jetbrains.com/help/idea/navigating-through-the-source-code.html
[IDE40]: https://raw.githubusercontent.com/microsoft/pylance-release/main/CHANGELOG.md
[IDE41]: https://github.com/microsoft/pylance-release
[IDE42]: https://code.visualstudio.com/license
[IDE43]: https://code.visualstudio.com/docs/typescript/typescript-editing
[SPC01]: https://manu.sridharan.net/files/pldi07.pdf
[SPC04]: https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/
[SPC05]: https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/
[SPC06]: https://codeql.github.com/docs/writing-codeql-queries/creating-path-queries/
[SPC07]: https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/explore-data-flow
[SPC08]: https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-vs-code/running-codeql-queries
[SPC09]: https://codeql.github.com/docs/writing-codeql-queries/debugging-data-flow-queries-using-partial-flow/
[SPC10]: https://docs.github.com/en/code-security/tutorials/customize-code-scanning/prepare-code-for-analysis
[SPC11]: https://github.com/github/codeql-cli-binaries/releases
[SPC12]: https://github.com/github/vscode-codeql
[SPC13]: https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/assess-alerts
[SPC14]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview
[SPC15]: https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/advanced
[SPC16]: https://docs.semgrep.dev/cli-reference
[SPC17]: https://docs.semgrep.dev/semgrep-code/semgrep-pro-engine-intro
[SPC18]: https://github.com/semgrep/semgrep/releases
[SPC19]: https://github.com/semgrep/semgrep
[SPC20]: https://semgrep.dev/assets/release-marketing/spring-2025-semgrep-release-marketing-kit.pdf
[SPC21]: https://semgrep.dev/products/product-updates/in-app-code-snippets-are-now-supported-for-cross-file-dataflow-traces/
[SPC22]: https://github.com/joernio/joern/releases/
[SPC23]: https://github.com/joernio/joern
[SPC24]: https://docs.joern.io/quickstart/
[SPC25]: https://docs.joern.io/cpgql/data-flow-steps/
[SPC26]: https://docs.joern.io/cpgql/control-flow-steps/
[SPC27]: https://docs.joern.io/dataflow-semantics/
[SPC28]: https://docs.joern.io/cpg-slicing/
[SPC29]: https://docs.joern.io/frontends/javascript/
[SPC30]: https://docs.joern.io/frontends/python/
[SPC31]: https://docs.joern.io/export/
[SPC32]: https://docs.scitools.com/help/dependencies/what-are-dependencies.html
[SPC33]: https://docs.scitools.com/help/dependencies/browse-and-export-dependencies.html
[SPC34]: https://docs.scitools.com/help/graphs/open-a-graph.html
[SPC35]: https://docs.scitools.com/buildnotes/
[SPC36]: https://docs.scitools.com/help/getting-started/supported-languages.html
[SPC37]: https://docs.scitools.com/help/licensing/open-source-license.html
[SPC38]: https://sourcegraph.com/docs/code-navigation
[SPC39]: https://sourcegraph.com/docs/code-navigation/precise-code-navigation
[SPC40]: https://sourcegraph.com/changelog/releases/8.1.0
[SPC41]: https://sourcegraph.com/changelog/latest
[SPC42]: https://github.com/CoatiSoftware/Sourcetrail
[SPC43]: https://github.com/CoatiSoftware/Sourcetrail/blob/master/DOCUMENTATION.md?plain=1
[SPC44]: https://www.ndepend.com/docs/dependency-structure-matrix-dsm/
[SPC45]: https://www.ndepend.com/docs/ndepend-analysis-inputs-explanation
[SPC46]: https://www.ndepend.com/purchase
[SPC47]: https://www.ndepend.com/release-notes
[SPC48]: https://github.com/sverweij/dependency-cruiser
[SPC49]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
[SPC50]: https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md
[SPC51]: https://github.com/sverweij/dependency-cruiser/releases
[SPC52]: https://github.com/pahen/madge
[SPC53]: https://github.com/pahen/madge/blob/master/package.json
[SPC54]: https://faculty.washington.edu/ajko/papers/Ko2009JavaWhylineUI.pdf
[SPC55]: https://github.com/github/codeql/blob/main/javascript/ql/src/Security/CWE-022/TaintedPath.ql
[SPC56]: https://codeql.github.com/codeql-query-help/javascript/js-path-injection/

[SRC-A]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/client/src/viz/deps/flow/anchorAdapter.ts#L68-L181
[SRC-B]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/srcly/ops/anchor-graph.ts#L677-L683
[SRC-C]: https://github.com/byronwall/srcly/blob/ee8a771ce94fb59573492445d0f5fa2411ad83c8/engine/src/analysis/evidence-slice.ts#L485-L562
