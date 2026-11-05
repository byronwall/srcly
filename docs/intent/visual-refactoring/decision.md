# Executable visual refactoring

The Refactor view and an agent submit the same `.srcly` plan to the same compiler.
The compiler produces exact code edits and diagnostics. Execution replays the
recorded codemod in an isolated Git worktree; it never asks an AI to rewrite code.

The design interview chose a relationship graph, ordered chain and per-step
diffs; a concise DSL; logical handles that survive moves; fail-closed operation
checks; whole-chain simulation; and persistent reversible checkpoints. The source
must be a clean commit. Editing the source or plan invalidates its preview.

## First executable slice

Open **Refactor**, load one leaf TypeScript config, select a file, supply its new
path and add the move. The form and DSL describe one plan. Preview simulates the
whole chain and checks TypeScript before and after every step. Select any step to
inspect its import graph and exact diff. Apply next step, Run all and Undo operate
on the recorded edits in the displayed worktree. The source checkout is untouched.
The last plan and run survive a browser reload, and journals survive server restarts.

![File move preview, import graph, DSL and generated codemod](assets/file-move-preview.png)

```text
refactor 1
project "tsconfig.json"
let state = file "src/state.ts"
move-file $state -> "src/model/state.ts"
move-file $state -> "src/domain/session.ts"
```

Paths are relative to the scanned project. Quotes allow spaces; `#` starts a
comment. Declarations precede steps. `$state` follows its file through the chain.
The parser rejects unknown commands, duplicate or missing handles, and unsafe
paths with a line number. Up/down controls change execution order; preview checks
the resulting order. TypeScript's language service updates imports and re-exports,
including aliases, and diagnostics gate each intermediate result.

## Agent contract

1. `GET /api/refactor/project?path=<absolute root>&config=tsconfig.json` supplies the
   file/import graph and baseline compiler diagnostics.
2. `POST /api/refactor/parse` with `{path, source}` parses the DSL without changes.
   Failures return `detail: {code, message, line}`.
3. `POST /api/refactor/preview` with the same body compiles the full chain. A
   blocked run includes `diagnostics`, the failing line, completed previews and a
   reason. A ready run includes its `id`, base commit, graphs and per-step diffs.
4. `GET /api/refactor/runs/<id>/codemod` exports `srcly-codemod-1`: the plan,
   base commit, exact before/after contents and modes, validation results, and
   the execution endpoint. This artifact describes the registered run; editing
   a downloaded artifact does not change what execution applies.
5. `POST /api/refactor/runs/<id>/execute` with `{mode: "next" | "all" | "undo"}`
   replays or reverses the stored edits. `GET /api/refactor/runs/<id>` resumes
   inspection. Execution refuses changed source or worktree contents.

An agent can iterate on the DSL and diagnostics, then execute the approved
codemod. It does not have to discover or patch every import itself. The compiler
process is memory bounded and separate from the read-only data-flow worker.

## Execution and limits

Journals live beside srcly's analysis cache under `refactor/<run id>/run.json`.
The source commit, source fingerprint, execution fingerprint and every edit's
exact bytes and file mode are preconditions. An fsynced write-ahead record lets a
partially applied step restore its prior checkpoint after interruption; unknown
edits are refused. A failed preview reverses its completed steps and remains
non-executable. Preview interruption also remains non-executable.

Installed `node_modules` directories are linked into the worktree for type
resolution. They are never edit targets. One tsconfig, source files up to 2 MB
per edited file, and at most 100 steps are supported initially. Project references
require choosing a leaf config. Computed dynamic imports and files observing
their own location (`import.meta`, `__dirname`, `__filename`) are refused.
TypeScript validation is a compiler check, not a proof of runtime equivalence.
Asset loading, build-tool conventions, external consumers and test commands are
outside this first operation's guarantees.

The intended semantic acceptance cases are global state → owner-scoped context
→ consumer hook, code extraction that preserves Solid ownership and reactive
reads, and explicit state machines derived from reducer-style conditional trees.
Those operations need their own preconditions; their availability must be named
by the compiler. Python uses the same plan and journal model with a language
adapter for module moves and imports.

Acceptance: `server/tests/test_refactor.py` exercises real compiler edits through
aliases, re-exports and TSX, chained handle moves, stale-input refusals, failed
preview rollback and interrupted execution recovery. `client/e2e/refactor.spec.ts`
drives the real app through preview, apply, reload and undo and captures screenshots.

## Symbols, extraction and type edits

The operation picker and `srcly refactor catalog` now expose symbol moves,
symbol/interface-property renames, function and display-only component extraction,
and adding, updating or removing types and type members. Use symbol handles for
declarations (`"Props.title"` names an interface member) and selection handles for
unique exact source text. Quoted strings use JSON escapes, including `\n` for a
multiline selection. An extraction changes its handle into the generated symbol;
a nested extracted component has a qualified handle such as `Card.Details`.

```text
refactor 1
project "tsconfig.json"
let formula = selection "src/math.ts" "x * 2 + 1"
extract-function $formula -> calculate
rename $formula -> compute
move-symbol $formula -> "src/math/compute.ts"
```

Moves refuse local dependencies with the `dependencies-required` diagnostic,
listing names and suggested declarations/steps. The UI can insert a suggestion
before the blocked move. `reexport` on a named symbol move retains its old public
entry point. A move of a nested closure requires an explicit interface for its
captured variables. Initial component extraction accepts intrinsic display-only
markup with lexical reads; calls, child components, refs, directives and spreads
are named refusals. These constraints are part of the operation, not guesses made
by the agent. `server/tests/test_refactor_operations.py` covers the real compiler.

Type edits deliberately differ from structural operations. The user can add a
required member and let TypeScript enumerate the broken consumers:

```text
refactor 1
let person = symbol "src/types.ts" "Person"
add-member $person "age: number"
```

The result is `ready-with-errors`, then `complete-with-errors` when applied. Every
diagnostic is visible by file, line, code and message. These are executable type
edits and explicit repair work. `update-member $person "age?: number"` can resolve
those errors in a later step. `remove-member`, `add-type`, `update-type` and
`remove-type` use the same policy. Syntax/config errors always block. Other
operations cannot introduce new compiler errors. Default-value insertion is not
implemented; it needs a separate value-generation policy.

![Required type member applied with an explicit TypeScript repair list](assets/type-member-errors.png)

## Headless agent workflow

```sh
srcly refactor catalog
srcly refactor project --path /absolute/project --config tsconfig.json
srcly refactor parse plan.srcly
srcly refactor preview plan.srcly --path /absolute/project
srcly refactor codemod RUN_ID > codemod.json
srcly refactor apply RUN_ID             # next step
srcly refactor apply RUN_ID --all
srcly refactor undo RUN_ID
srcly refactor show RUN_ID
```

All output is JSON. Invalid or blocked plans exit with status 2 and structured
diagnostics. The codemod artifact includes its execution command. The CLI and
server use the same persistent runs, with an OS file lock per run so an agent and
the UI cannot apply a step simultaneously. There is no model call in execution.
