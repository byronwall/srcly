import json
from pathlib import Path

from app.run import main
from app.services.findings import listing
from app.services.findings.astgrep import rule_ids
from app.services.findings.duplicate_types import DuplicateTypeTool
from app.services.findings.runner import run_tools
from app.services.findings.tools import MissingTool

DOC = "{ id: string; title: string; createdAt: string }"


def test_findings_lists_one_rule_with_a_count_and_never_reads_a_failed_checker_as_zero(tmp_path: Path, capsys):
    root = tmp_path.resolve()
    (root / "api.ts").write_text(f"export type Doc = {DOC};\n", encoding="utf-8")
    (root / "view.ts").write_text(f"const x: any = 1;\ntype Doc = {DOC};\n", encoding="utf-8")

    main(["findings", str(root), "--rule", "duplicate-type", "--format", "json"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["count"] == 1
    assert [(f["path"], f["line"], f["rule"]) for f in payload["findings"]] == [("view.ts", 2, "duplicate-type")]

    main(["findings", str(root), "--rule", "duplicate-type"])
    out = capsys.readouterr().out
    assert out.startswith("view.ts:2 duplicate-type `Doc` copies")
    assert "duplicate-type: 1\n" in out

    # The project's eslint cannot run: srcly's own rule still has a count, an eslint rule does not.
    tools = [DuplicateTypeTool(root), MissingTool("eslint", "eslint", "eslint", root, (".ts",), "eslint is not installed")]
    got = listing.build(root, run_tools(root, tools), tools, ["duplicate-type", "no-debugger"])
    assert [(r["rule"], r["count"]) for r in got["rules"]] == [("duplicate-type", 1), ("no-debugger", None)]
    assert got["count"] is None
    assert "no-debugger: N/A (eslint failed: eslint is not installed" in listing.render(got)

    # The rule's own checker failed: N/A, not 0.
    broken = MissingTool("srcly-dup-types", "srcly-dup-types", "srcly duplicate types", root, (".ts",), "timed out")
    broken.rules = DuplicateTypeTool.rules
    assert "duplicate-type: N/A (srcly duplicate types failed: timed out" in listing.render(listing.build(root, run_tools(root, [broken]), [broken], ["duplicate-type"]))

    # An ast-grep id may also be an eslint rule's name: a failed eslint blocks it. A trailing comment is not part of the id.
    (root / "pack.yml").write_text('id: no-debugger # ours\nlanguage: typescript\n', encoding="utf-8")
    assert rule_ids([root / "pack.yml"]) == ("no-debugger",)
    pack = MissingTool("ast-grep", "ast-grep", "ast-grep", root, (".ts",), "")
    pack.rules = ("no-debugger",)
    pack.check = lambda: ([], [str(root / "view.ts")])
    both = [pack, tools[1]]
    assert listing.build(root, run_tools(root, both), both, ["no-debugger"])["count"] is None

    # A tsconfig without tsc: its rules and the unfiltered total are N/A, srcly's own rule is not.
    (root / "tsconfig.json").write_text("{}", encoding="utf-8")
    main(["findings", str(root), "--rule", "TS2322", "--rule", "duplicate-type", "--format", "json"])
    got = json.loads(capsys.readouterr().out)
    assert [(r["rule"], r["count"]) for r in got["rules"]] == [("TS2322", None), ("duplicate-type", 1)]
    assert "no node_modules/.bin/tsc" in got["rules"][0]["reason"]
    main(["findings", str(root)])
    assert "Total: N/A (tsc (tsconfig.json) not run" in capsys.readouterr().out

    # ruff ran, but its settings may leave the rule off: no finding is N/A, not 0.
    (root / "ok.py").write_text("x = 1\n", encoding="utf-8")
    main(["findings", str(root), "--rule", "B006"])
    assert "B006: N/A (no finding, and srcly cannot tell whether ruff has this rule switched on" in capsys.readouterr().out

    # A checker that found no file to check says nothing about the code.
    (root / "api.ts").unlink()
    (root / "view.ts").unlink()
    empty = [DuplicateTypeTool(root)]
    for rules in (["duplicate-type"], ["F401"], []):
        assert listing.build(root, run_tools(root, empty), empty, rules)["count"] is None
