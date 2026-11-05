import os
from pathlib import Path

from app.services.findings import astgrep
from app.services.findings.tools import MissingTool, run

FAKE = """#!/bin/sh
# Stands in for ast-grep scan --json=stream: one match per line, 0-based positions.
echo '{"file":"src/a.ts","range":{"start":{"line":2,"column":4},"end":{"line":3,"column":1}},"ruleId":"paged-order-no-tiebreak","severity":"warning","message":"add an id tie-break"}'
exit 0
"""

RULE = "id: paged-order-no-tiebreak\nlanguage: typescript\nrule:\n  pattern: orderBy\n"


def _repo(tmp_path: Path) -> Path:
    root = tmp_path.resolve()
    (root / ".srcly" / "rules").mkdir(parents=True)
    (root / ".srcly" / "rules" / "r3.yml").write_text(RULE)
    (root / "src").mkdir()
    (root / "src" / "a.ts").write_text("export const q = {\n  take: 1,\n    orderBy: { createdAt: 'asc' },\n};\n")
    return root


def test_rule_pack_runs_ast_grep_and_reports_each_match(tmp_path: Path, monkeypatch) -> None:
    root = _repo(tmp_path)
    fake = root / "bin" / "ast-grep"
    fake.parent.mkdir()
    fake.write_text(FAKE)
    fake.chmod(0o755)
    monkeypatch.setenv("SRCLY_AST_GREP", str(fake))
    [tool] = astgrep.plan(root, stop=root)
    assert tool.extensions == (".ts", ".mts", ".cts")
    result, findings = run(tool)
    assert result.ok, result.reason
    [f] = findings
    assert (f.path, f.line, f.column, f.rule) == (str(root / "src" / "a.ts"), 3, 5, "paged-order-no-tiebreak")


def test_missing_ast_grep_is_na(tmp_path: Path, monkeypatch) -> None:
    root = _repo(tmp_path)
    monkeypatch.delenv("SRCLY_AST_GREP", raising=False)
    monkeypatch.setenv("PATH", os.devnull)
    [tool] = astgrep.plan(root, stop=root)
    assert isinstance(tool, MissingTool)
    result, _ = run(tool)
    assert result.status == "na" and "ast-grep is not installed" in result.reason


def test_no_rules_no_tool(tmp_path: Path) -> None:
    assert astgrep.plan(tmp_path.resolve(), stop=tmp_path.resolve()) == []
