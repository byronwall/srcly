import json
import subprocess
from pathlib import Path

import pytest

from app.services.compare.git_refs import run_git
from app.services.refactor import runs
from test_refactor import project  # noqa: F401
from test_refactor_operations import add


REDUCER = '''export type State = "idle" | "running" | "done";
export type Event = "start" | "finish" | "reset";
export function transition(state: State, event: Event): State {
  if (event === "reset") return "idle";
  if (state === "idle") {
    if (event === "start") return "running";
  } else if (state === "running" && event === "finish") {
    return "done";
  }
  return state;
}
'''


def test_machine_exhausts_the_domain_and_preserves_branch_priority(project):
    add(project, "src/machine.ts", REDUCER)
    preview = runs.preview(project, 'refactor 1\nlet reducer = symbol "src/machine.ts" "transition"\nstate-machine $reducer -> transitions\n')
    assert preview["status"] == "ready", preview["error"]
    machine = preview["steps"][0]["machine"]
    assert len(machine["transitions"]) == 9
    actual = {(t["from"], t["event"]): t["to"] for t in machine["transitions"]}
    for state in ["idle", "running", "done"]:
        for event in ["start", "finish", "reset"]:
            expected = "idle" if event == "reset" else "running" if state == "idle" and event == "start" else "done" if state == "running" and event == "finish" else state
            assert actual[state, event] == expected
    applied = runs.execute(preview["id"], "all")
    text = (Path(applied["projectRoot"]) / "src/machine.ts").read_text()
    assert "return transitions[state][event]" in text
    assert "if (" not in text
    runs.execute(preview["id"], "undo")
    assert (Path(applied["projectRoot"]) / "src/machine.ts").read_text() == REDUCER


def test_generated_machine_executes_equivalently_including_prototype_keys(project):
    source = 'type State = "idle" | "__proto__"; type Event = "start" | "__proto__";\nexport const initial = transition("idle", "start");\nexport function transition(state: State, event: Event): State { if (event === "__proto__") return "idle"; if (state === "idle") return "__proto__"; return state; }\n'
    add(project, "src/machine.ts", source)
    preview = runs.preview(project, 'refactor 1\nlet reducer = symbol "src/machine.ts" "transition"\nstate-machine $reducer -> transitions\n')
    assert preview["status"] == "ready", preview["error"]
    applied = runs.execute(preview["id"], "all")
    root = Path(applied["projectRoot"])
    package = Path(__file__).parents[2] / "engine/package.json"
    runner = root / "machine-test.mjs"
    runner.write_text(f'''
import assert from "node:assert/strict";
import fs from "node:fs";
import {{ createRequire }} from "node:module";
const ts = createRequire({json.dumps(str(package))})("typescript");
for (const [name, source] of [["before", {json.dumps(source)}], ["after", fs.readFileSync("src/machine.ts", "utf8")]]) {{
  fs.writeFileSync(`${{name}}.mjs`, ts.transpileModule(source, {{ compilerOptions: {{ module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }} }}).outputText);
}}
const before = await import("./before.mjs"), after = await import("./after.mjs");
assert.equal(before.initial, after.initial);
for (const state of ["idle", "__proto__"]) for (const event of ["start", "__proto__"]) assert.equal(before.transition(state, event), after.transition(state, event));
''')
    result = subprocess.run(["node", str(runner)], cwd=root, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("replacement", [
    'console.log(state); return state;',
    'if (event === "start") return "running";',
    'if (state.length > 2) return "idle"; return state;',
    'if (false) { console.log("unreachable"); } return state;',
])
def test_machine_refuses_effects_unknown_guards_and_missing_transitions(project, replacement):
    add(project, "src/machine.ts", REDUCER[:REDUCER.index("  if (")] + replacement + "\n}\n")
    preview = runs.preview(project, 'refactor 1\nlet reducer = symbol "src/machine.ts" "transition"\nstate-machine $reducer -> transitions\n')
    assert preview["status"] == "blocked"
    assert not (Path(preview["projectRoot"]) / "src/machine.ts").read_text().startswith("const transitions")


@pytest.fixture
def solid_project(project):
    dependencies = Path(__file__).parents[2] / "engine" / "node_modules"
    (project / "node_modules").symlink_to(dependencies, target_is_directory=True)
    (project / ".gitignore").write_text("node_modules\n")
    (project / "src/index.ts").write_text("export {};\n")
    (project / "src/jsx.d.ts").unlink()
    config = json.loads((project / "tsconfig.json").read_text())
    config["compilerOptions"]["jsxImportSource"] = "solid-js"
    (project / "tsconfig.json").write_text(json.dumps(config))
    (project / "src/state.ts").write_text('import { createSignal, createEffect, onCleanup } from "solid-js";\nexport const [count, setCount] = createSignal(0);\nexport function increment() { setCount(n => n + 1); }\ncreateEffect(() => { count(); });\nonCleanup(() => { /* release owned resources */ });\n')
    (project / "src/App.tsx").write_text('import { count, increment } from "./state";\nexport function Counter() { return <button onClick={increment}>{count()}</button>; }\nexport function App() { return <Counter />; }\n')
    run_git(project, "add", ".")
    run_git(project, "commit", "-qm", "Solid fixture")
    return project


CONTEXT_PLAN = 'refactor 1\nlet app = symbol "src/App.tsx" "App"\nsolid-context "src/state.ts" -> "src/CounterContext.tsx" provider CounterProvider hook useCounter within $app\n'


def test_global_solid_state_becomes_a_provider_and_hook(solid_project):
    preview = runs.preview(solid_project, CONTEXT_PLAN)
    assert preview["status"] == "ready", preview["error"]
    ownership = preview["steps"][0]["ownership"]
    assert ownership["consumers"] == [{"file": "src/App.tsx", "name": "Counter"}]
    applied = runs.execute(preview["id"], "all")
    root = Path(applied["projectRoot"])
    context = (root / "src/CounterContext.tsx").read_text()
    app = (root / "src/App.tsx").read_text()
    assert "const value = createSrclyState()" in context
    assert "onCleanup(" in context and "createEffect(" in context
    assert "const { count, increment } = useCounter()" in app
    assert "<CounterProvider><AppContent /></CounterProvider>" in app
    assert "createSignal(0)" in (solid_project / "src/state.ts").read_text()
    runs.execute(preview["id"], "undo")
    assert not (root / "src/CounterContext.tsx").exists()


def test_owned_state_handles_follow_context_creation_and_subsequent_file_moves(solid_project):
    plan = 'refactor 1\nlet state = file "src/state.ts"\nlet increment = symbol "src/state.ts" "increment"\nlet app = symbol "src/App.tsx" "App"\nsolid-context $state -> "src/CounterContext.tsx" provider CounterProvider hook useCounter within $app\nrename $increment -> advance\nmove-file $state -> "src/model/CounterContext.tsx"\n'
    preview = runs.preview(solid_project, plan)
    assert preview["status"] == "ready", preview["error"]
    applied = runs.execute(preview["id"], "all")
    root = Path(applied["projectRoot"])
    assert "function advance" in (root / "src/model/CounterContext.tsx").read_text()
    assert "model/CounterContext" in (root / "src/App.tsx").read_text()


def test_root_state_reads_move_below_the_provider_and_preserve_import_aliases(solid_project):
    add(solid_project, "src/App.tsx", 'import { count as current } from "./state";\nexport function App(props: { title: string }) { return <div>{props.title}: {current()}</div>; }\n')
    preview = runs.preview(solid_project, CONTEXT_PLAN)
    assert preview["status"] == "ready", preview["error"]
    run = runs.execute(preview["id"], "all")
    app = (Path(run["projectRoot"]) / "src/App.tsx").read_text()
    assert "count: current" in app and "<AppContent {...props}" in app


def test_generated_context_has_independent_state_reactive_effects_and_cleanup(solid_project):
    add(solid_project, "src/state.ts", 'import { createSignal, createEffect, onCleanup } from "solid-js";\nexport const [count, setCount] = createSignal(0);\nexport function increment() { setCount(n => n + 1); }\ncreateEffect(() => console.log("effect", count()));\nonCleanup(() => console.log("cleanup"));\n')
    preview = runs.preview(solid_project, CONTEXT_PLAN)
    assert preview["status"] == "ready", preview["error"]
    applied = runs.execute(preview["id"], "all")
    root = Path(applied["projectRoot"])
    checkout = Path(__file__).parents[2]
    runner = root / "runtime.mjs"
    # Compile the emitted TSX with Solid's real JSX transform. Execute against
    # the browser reactive core (the default Node SSR core skips effects).
    runner.write_text(f'''
import assert from "node:assert/strict";
import fs from "node:fs";
import {{ createRequire }} from "node:module";
import {{ createRoot, createComponent }} from "solid-js";
const engine = createRequire({json.dumps(str(checkout / "engine/package.json"))});
const client = createRequire({json.dumps(str(checkout / "client/package.json"))});
const plugin = createRequire(client.resolve("vite-plugin-solid"));
const {{ transformSync }} = plugin("@babel/core");
const preset = plugin("babel-preset-solid");
const js = engine("esbuild").transformSync(fs.readFileSync("src/CounterContext.tsx", "utf8"), {{ loader: "tsx", jsx: "preserve", format: "esm" }}).code;
const compiled = transformSync(js, {{ presets: [[preset, {{ generate: "ssr", hydratable: false }}]], filename: "context.jsx" }}).code;
fs.writeFileSync("context.mjs", compiled);
const {{ CounterProvider, useCounter }} = await import("./context.mjs");
const events = [];
console.log = (...args) => events.push(args);
const mount = () => {{
  let value, dispose;
  createRoot(stop => {{
    dispose = stop;
    createComponent(CounterProvider, {{ get children() {{ value = useCounter(); return ""; }} }});
  }});
  assert.ok(value, "provider child must be evaluated under its owner");
  return {{ value, dispose }};
}};
const first = mount(), second = mount();
assert.equal(first.value.count(), 0);
assert.equal(second.value.count(), 0);
first.value.increment();
assert.equal(first.value.count(), 1);
assert.equal(second.value.count(), 0);
assert.ok(events.some(([kind, count]) => kind === "effect" && count === 1));
first.dispose();
assert.equal(events.filter(([kind]) => kind === "cleanup").length, 1);
const afterDispose = events.length;
first.value.increment();
assert.equal(events.length, afterDispose, "disposed effects must stop");
second.dispose();
assert.equal(events.filter(([kind]) => kind === "cleanup").length, 2);
assert.throws(() => useCounter(), /requires CounterProvider/);
''')
    result = subprocess.run(["node", "--conditions=browser", str(runner)], cwd=root, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("consumer", [
    'import { count } from "./state"; export const cached = count();',
    'import { count } from "./state"; export function OtherRoot() { return <div>{count()}</div>; }',
    'export { count } from "./state";',
    'import { Counter } from "./App"; export function OtherRoot() { return <Counter />; }',
    'import { Counter } from "./App"; export const callback = Counter;',
])
def test_context_refuses_uncovered_consumers_and_barrels(solid_project, consumer):
    add(solid_project, "src/outside.tsx", consumer)
    preview = runs.preview(solid_project, CONTEXT_PLAN)
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "context-proof-required", preview["error"]


def test_context_refuses_runtime_relative_module_loading(solid_project):
    add(solid_project, "src/lazy.ts", "export const value = 1;\n")
    add(solid_project, "src/state.ts", (solid_project / "src/state.ts").read_text() + 'export function load() { return import("./lazy"); }\n')
    preview = runs.preview(solid_project, CONTEXT_PLAN)
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "context-proof-required"
