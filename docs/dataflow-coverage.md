# Data-flow coverage: what landed

This file records the data-flow coverage work that is in `main`. Open work is in the backlog grid (`pgm/data`, see `AGENTS.md` → Backlog), not here.

The work came from the data-flow experience audit (October 2026). The audit traced about 120 exports per repo on six repos and ranked where traces stop. Each PR below removes one cause of a false stop, or names a stop that was silent.

## How coverage is measured

- `engine/scripts/survey-blockers.ts` traces a sample of exports in both directions and writes every outcome and stop as JSON (#162). `engine/scripts/survey-report.ts` ranks the stops.
- `pnpm survey-gate` (CI's `survey` job) surveys `client/`, `server/` and `examples/value-flow-basics` and fails on any move the PR does not record (#192, #205).
- A rule's test is an annotated fixture in `engine/examples/value-flow-basics/src/`. `engine/test/srcly/fixture-annotations.test.ts` checks the `@trace`, `@outcome`, `@reaches` and `@stop` claims (#201).
- The r3 survey, before #198, was 19% ok: TypeScript 16%, Python 25%.

## Outcomes and honesty

- A trace says what each side holds and where it stops (#151, #152, #155). A frontier box is labelled by why the trace stops (#158), and every partial trace names its stop (#169).
- `ok` means proven. A trace that lands only through an assumed library step is not `ok` (#183).
- A budget-exhausted route slice names its omission (#161). Size limits are spent only on fields the trace reads and places it draws (#168, #197).
- When nothing is drawn, the view says why and offers to try again (#160).

## TypeScript rules

- Dead ends: four kinds carried past (#167); four more found by fixture annotations (#202).
- Reads and writes: a read sees every assignment that can reach it (#173); a computed key is a partial read of its receiver (#171); array elements, spreads and `for…of` (#174).
- Calls: the slice's call pairing is trusted at every helper (#170); a function's field reads land through its argument (#163); a first-party method is entered through `this` (#176); a call is paired with the one function its value is, through objects, bindings and aliases (#198, `engine/src/analysis/value-origin.ts`).
- Library calls: a discarded call's arguments stay in a receiver its function declares (#175); a library call's receiver reaches the function it is given (#184); a library call is known by its import's module and export name (#209).
- Components: prop reads in closures and string-literal props bind to the caller (#159); destructured and optional props bind (#186); a factory or alias component renders at the JSX tag that names it (#180); a default-exported function anchors by its own name (#178).
- State: a setter's value reaches its getter's reads (#182); state-pair factory and getter calls are framework-modelled (#188), modelled in the collector (#196).
- Ends: a thrown value ends at the throw (#207). A class's annotated uses fold by file (#208).

## Python rules

- Any `def` or class anchors by name (#164). Calls pair by invocation (#166).
- Classes flow through fields and annotations (#172). ORM models get fields from assigned field instances (#189).
- External-code and branch-test ends apply to Python (#177). A request starts at the request and its response ends at the return (#181). Values begin and end where the code does (#199).
- A framework decorator's function is an entry (#185). A FastAPI dependency parameter fills from its function, and a function handed to outside code is entered (#204).
- Routes: a first-party subclass of `APIRouter`, `FastAPI`, `Flask` or `Blueprint` is a router; a mount prefix carries through every router above it and may be a settings field with a literal default (#221).
- A root that is itself a package names its modules from above it, so its own imports resolve (#221).
- A SQLAlchemy session write (`add`, `add_all`, `delete`, `merge`, and the async session's) ends a trace as a database write (#222).
- A value handed to library code with no model is assumed to reach its result, so a trace that lands only through it is partial; a built-in type's or a standard container protocol's method is modelled (#223).

## Python roots in the UI

These came from the Python data-flow usability audit (`docs/research/python-dataflow-audit-2026-10/`).

- A TypeScript root names the Python apps below it and opens one in a click (#218).
- On a Python root, the inspector names each relation, the legend uses value words, and unsupported features say so instead of failing (#220).
- A Python app's first build gets its full timeout; status polls no longer spend it, and progress shows the seconds so far (#219).

## Engine structure

- Every evidence kind is classified once in `engine/src/srcly/kinds.ts` (#200). Rules read traits, not lists of kind names.
- Library models load as data rows (#206). Python origins and terminals read from rows (#212). The plan and its progress are in `docs/intent/dataflow-library-models/plan.md`.
- Memory: the engine holds one Program and bounds what it keeps (#165). The checker truncates the type text in facts (#193).
