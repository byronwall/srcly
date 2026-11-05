import json
import re
import sys
from pathlib import Path

from app.services.compare.git_refs import run_git
from app.services.refactor import runs
from test_refactor import project  # noqa: F401


def add(root, name, text):
    file = root / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text)
    run_git(root, "add", ".")
    run_git(root, "commit", "-qm", "add fixture")


def test_extract_rename_move_chain_follows_the_generated_symbol(project):
    add(project, "src/math.ts", "export function total(x: number) { return x * 2 + 1; }\n")
    plan = '''refactor 1
let formula = selection "src/math.ts" "x * 2 + 1"
extract-function $formula -> calculate
rename $formula -> compute
move-symbol $formula -> "src/compute.ts"
'''
    preview = runs.preview(project, plan)
    assert preview["status"] == "ready", preview["error"]
    result = runs.execute(preview["id"], "all")
    root = Path(result["projectRoot"])
    assert "function compute" in (root / "src/compute.ts").read_text()
    assert "compute(x)" in (root / "src/math.ts").read_text()
    assert (project / "src/math.ts").read_text() == "export function total(x: number) { return x * 2 + 1; }\n"


def test_private_dependencies_produce_dsl_guidance_and_can_be_moved_first(project):
    add(project, "src/math.ts", "const offset = 2;\nexport function total(x: number) { return x + offset; }\n")
    declarations = 'refactor 1\nlet total = symbol "src/math.ts" "total"\n'
    blocked = runs.preview(project, declarations + 'move-symbol $total -> "src/math/total.ts"\n')
    assert blocked["status"] == "blocked"
    assert blocked["diagnostics"][0]["code"] == "dependencies-required"
    assert blocked["diagnostics"][0]["details"]["dependencies"] == [{"file": "src/math.ts", "name": "offset"}]
    assert "move-symbol $offset" in blocked["diagnostics"][0]["suggestions"][0]
    plan = declarations + 'let offset = symbol "src/math.ts" "offset"\nmove-symbol $offset -> "src/math/total.ts"\nmove-symbol $total -> "src/math/total.ts" reexport\n'
    ready = runs.preview(project, plan)
    assert ready["status"] == "ready", ready["error"]
    result = runs.execute(ready["id"], "all")
    root = Path(result["projectRoot"])
    assert "export { total }" in (root / "src/math.ts").read_text()
    assert re.search(r"const\s+offset\s*=\s*2", (root / "src/math/total.ts").read_text())


def test_rename_interface_property_updates_typed_consumers_and_jsx(project):
    add(project, "src/Card.tsx", 'export interface Props { label: string }\nexport function Card(props: Props) { return <div>{props.label}</div>; }\nexport const sample = <Card label="Title" />;\n')
    preview = runs.preview(project, 'refactor 1\nlet label = symbol "src/Card.tsx" "Props.label"\nrename $label -> title\n')
    assert preview["status"] == "ready", preview["error"]
    run = runs.execute(preview["id"], "all")
    result = (Path(run["projectRoot"]) / "src/Card.tsx").read_text()
    assert "title: string" in result
    assert "props.title" in result
    assert '<Card title="Title"' in result


def test_extract_component_keeps_lexical_reads_and_a_renameable_handle(project):
    add(project, "src/Card.tsx", 'export function Card(title: string) { return <div>{title}</div>; }\n')
    plan = 'refactor 1\nlet markup = selection "src/Card.tsx" "<div>{title}</div>"\nextract-component $markup -> Details\nrename $markup -> Content\n'
    preview = runs.preview(project, plan)
    assert preview["status"] == "ready", preview["error"]
    run = runs.execute(preview["id"], "all")
    result = (Path(run["projectRoot"]) / "src/Card.tsx").read_text()
    assert "function Content()" in result
    assert "<Content />" in result
    assert "<div>{title}</div>" in result


def test_effectful_component_extraction_is_blocked(project):
    add(project, "src/Card.tsx", 'const read = () => "title";\nexport function Card() { return <div>{read()}</div>; }\n')
    plan = 'refactor 1\nlet markup = selection "src/Card.tsx" "<div>{read()}</div>"\nextract-component $markup -> Details\n'
    preview = runs.preview(project, plan)
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "effectful-jsx"


def test_symbol_move_refuses_module_location_dependencies(project):
    add(project, "src/resource.ts", "export function resource() { return import.meta.url; }\n")
    preview = runs.preview(project, 'refactor 1\nlet resource = symbol "src/resource.ts" "resource"\nmove-symbol $resource -> "src/model/resource.ts"\n')
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "location-dependent-symbol"


def test_exact_multiline_selection_is_json_decoded():
    from app.services.refactor.plan import parse

    text = 'const a = "x";\nreturn a;'
    plan = f'refactor 1\nlet part = selection "src/file.ts" {json.dumps(text)}\nextract-function $part -> run\n'
    assert parse(plan)["handles"]["part"]["text"] == text


def test_add_required_member_is_executable_and_lists_every_broken_consumer(project):
    add(project, "src/types.ts", 'export interface Person { name: string }\nexport const first: Person = { name: "Ada" };\nexport const second: Person = { name: "Grace" };\n')
    plan = 'refactor 1\nlet person = symbol "src/types.ts" "Person"\nadd-member $person "age: number"\n'
    preview = runs.preview(project, plan)
    assert preview["status"] == "ready-with-errors", preview["error"]
    assert len(preview["typeDiagnostics"]) == 2
    assert all("age" in item["message"] for item in preview["typeDiagnostics"])
    applied = runs.execute(preview["id"], "all")
    assert applied["status"] == "complete-with-errors"
    assert "age: number;" in (Path(applied["projectRoot"]) / "src/types.ts").read_text()
    assert "age" not in (project / "src/types.ts").read_text()
    assert runs.execute(preview["id"], "undo")["typeDiagnostics"] == []


def test_type_edits_can_introduce_and_then_resolve_expected_errors(project):
    add(project, "src/types.ts", 'export type Person = { name: string };\nexport const first: Person = { name: "Ada" };\n')
    plan = 'refactor 1\nlet person = symbol "src/types.ts" "Person"\nadd-member $person "age: number"\nupdate-member $person "age?: number"\nremove-member $person "age"\n'
    preview = runs.preview(project, plan)
    assert preview["status"] == "ready", preview["error"]
    assert [step["status"] for step in preview["steps"]] == ["type-errors", "validated", "validated"]
    assert runs.execute(preview["id"], "next")["status"] == "running-with-errors"
    assert runs.execute(preview["id"], "all")["status"] == "complete"


def test_syntax_errors_are_never_an_executable_type_edit(project):
    add(project, "src/types.ts", 'export interface Person { name: string }\n')
    preview = runs.preview(project, 'refactor 1\nlet person = symbol "src/types.ts" "Person"\nadd-member $person "age: Missing<"\n')
    assert preview["status"] == "blocked"
    assert "age" not in (project / "src/types.ts").read_text()


def test_configured_checkpoint_can_gate_an_intentional_type_error(project):
    from app.services.dataflow.availability import locate_node

    add(project, "src/types.ts", 'export interface Person { name: string }\nexport const value: Person = { name: "Ada" };\n')
    compiler = Path(__file__).parents[2] / "engine/node_modules/typescript/bin/tsc"
    add(project, ".srcly-refactor.json", json.dumps({"checks": {"types": [locate_node() or sys.executable, str(compiler), "--noEmit", "-p", "tsconfig.json"]}}))
    preview = runs.preview(project, 'refactor 1\nlet person = symbol "src/types.ts" "Person"\nadd-member $person "age: number"\ncheckpoint types\n')
    assert preview["status"] == "blocked"
    assert preview["steps"][0]["status"] == "type-errors"
    assert preview["steps"][1]["checkpoint"]["status"] == "failed"
    assert "age" in preview["steps"][1]["checkpoint"]["output"]
    assert "age" not in (Path(preview["projectRoot"]) / "src/types.ts").read_text()


def test_add_update_and_remove_type_declarations(project):
    plan = 'refactor 1\nadd-type "src/extra.ts" "export interface Extra { value: string }"\n'
    preview = runs.preview(project, plan)
    assert preview["status"] == "ready", preview["error"]
    add(project, "src/types.ts", "export interface Extra { value: string }\n")
    preview = runs.preview(project, 'refactor 1\nlet extra = symbol "src/types.ts" "Extra"\nupdate-type $extra "export type Extra = { value: number }"\nremove-type $extra\n')
    assert preview["status"] == "ready", preview["error"]


def test_type_creation_outside_the_checked_project_is_blocked(project):
    preview = runs.preview(project, 'refactor 1\nadd-type "outside/types.ts" "export interface Extra { value: string }"\n')
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "target-not-in-project"


def test_cli_guides_an_agent_and_compiles_the_same_plan(project, tmp_path, capsys):
    from app.services.refactor.cli import main

    main(["catalog"])
    assert "add-member" in [op["name"] for op in json.loads(capsys.readouterr().out)["operations"]]
    plan = tmp_path / "plan.srcly"
    plan.write_text('refactor 1\nmove-file "src/state.ts" -> "src/model/state.ts"\n')
    main(["preview", str(plan), "--path", str(project)])
    preview = json.loads(capsys.readouterr().out)
    assert preview["status"] == "ready", preview["error"]
    main(["codemod", preview["id"]])
    artifact = json.loads(capsys.readouterr().out)
    assert artifact["format"] == "srcly-codemod-1"
    assert artifact["command"] == ["srcly", "refactor", "apply", preview["id"], "--all"]
    main(["apply", preview["id"], "--all"])
    assert json.loads(capsys.readouterr().out)["status"] == "complete"
