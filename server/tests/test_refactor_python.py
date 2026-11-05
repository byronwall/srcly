import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.services.compare.git_refs import run_git
from app.services.refactor import checkpoints, compiler, runs
from app.services.refactor.plan import RefactorError


@pytest.fixture
def python_project(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    monkeypatch.setattr(runs, "directory", lambda: tmp_path / "runs")
    monkeypatch.setenv("SRCLY_CACHE_DIR", str(tmp_path / "cache"))
    files = {
        "pkg/__init__.py": "",
        "pkg/math.py": 'from .constants import OFFSET\n\ndef total(value: int) -> int:\n    return value + OFFSET\n',
        "pkg/constants.py": "OFFSET = 2\n",
        "pkg/model/__init__.py": "",
        "consumer.py": 'from pkg.math import total as calculate\nimport pkg.math as maths\nfrom pkg import math\n\ndef result():\n    return calculate(1) + maths.total(2) + math.total(3)\n',
        ".gitignore": "__pycache__/\n.pytest_cache/\n",
        ".srcly-refactor.json": json.dumps({"checks": {"unit": [sys.executable, "-c", "from consumer import result; assert result() == 12; print('consumers verified')"]}}),
    }
    for name, text in files.items():
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)
    run_git(root, "init", "-q")
    run_git(root, "config", "user.email", "test@srcly.invalid")
    run_git(root, "config", "user.name", "Srcly test")
    commit(root)
    return root


def commit(root):
    run_git(root, "add", ".")
    run_git(root, "commit", "-qm", "fixture")


CHAIN = '''refactor 1
language python
let maths = file "pkg/math.py"
move-file $maths -> "pkg/model/math.py"
move-file $maths -> "pkg/model/arithmetic.py"
checkpoint unit
'''


def test_python_move_rename_chain_updates_imports_runs_checks_and_undoes(python_project):
    before = runs.fingerprint(python_project)
    project = compiler.inspect(python_project, "tsconfig.json", language="python")
    assert {"from": "consumer.py", "to": "pkg/math.py"} in project["graph"]["edges"]
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    assert preview["steps"][-1]["checkpoint"]["status"] == "passed"
    applied = runs.execute(preview["id"], "all")
    root = Path(applied["projectRoot"])
    assert (root / "pkg/model/arithmetic.py").exists()
    assert not (root / "pkg/math.py").exists()
    assert "arithmetic" in (root / "consumer.py").read_text()
    assert "consumers verified" in applied["steps"][-1]["executionCheck"]["output"]
    assert runs.fingerprint(python_project) == before
    for _ in range(3):
        runs.execute(preview["id"], "undo")
    assert runs.fingerprint(root) == before


@pytest.mark.parametrize(("extra", "destination", "code"), [
    ("import importlib as loader\n", "pkg/model/math.py", "python-dynamic-import"),
    ("", "pkg/model/arithmetic.py", "python-split-move-rename"),
    ("", "missing/math.py", "python-package-required"),
    ("", "pkg/constants.py", "destination-exists"),
])
def test_python_blocks_unproven_moves(python_project, extra, destination, code):
    if extra:
        (python_project / "dynamic.py").write_text(extra)
        commit(python_project)
    preview = runs.preview(python_project, f'refactor 1\nlanguage python\nmove-file "pkg/math.py" -> "{destination}"\n')
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == code, preview["error"]


def test_python_syntax_and_module_identity_are_named_refusals(python_project):
    (python_project / "pkg/math.py").write_text("value = __file__\n")
    commit(python_project)
    plan = 'refactor 1\nlanguage python\nmove-file "pkg/math.py" -> "pkg/renamed.py"\n'
    preview = runs.preview(python_project, plan)
    assert preview["diagnostics"][0]["code"] == "python-module-identity"
    (python_project / "pkg/math.py").write_text("def broken(\n")
    commit(python_project)
    preview = runs.preview(python_project, plan)
    assert preview["status"] == "blocked" and preview["baselineDiagnostics"][0]["phase"] == "syntax"


def test_effectful_package_initialization_blocks_module_relocation(python_project):
    (python_project / "pkg/model/__init__.py").write_text('print("side effect")\n')
    commit(python_project)
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "python-package-effects"


def test_python_journal_preserves_exact_crlf_preimages(python_project):
    for file in python_project.rglob("*.py"):
        file.write_bytes(file.read_bytes().replace(b"\n", b"\r\n"))
    commit(python_project)
    before = runs.fingerprint(python_project)
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    runs.execute(preview["id"], "all")
    for _ in range(3):
        runs.execute(preview["id"], "undo")
    assert runs.fingerprint(Path(preview["projectRoot"])) == before


def test_incomplete_import_rewrite_is_refused(python_project, monkeypatch):
    real_inspect = compiler.inspect

    def omit_consumer(root, config, action=None, language="typescript"):
        result = real_inspect(root, config, action, language)
        if action:
            result["changes"] = [change for change in result["changes"] if change["path"] != "consumer.py"]
        return result

    monkeypatch.setattr(compiler, "inspect", omit_consumer)
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "blocked"
    assert preview["diagnostics"][0]["code"] == "python-import-proof-required"


def test_failed_checkpoint_restores_preview_and_stops_execution(python_project, monkeypatch):
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    real_run = checkpoints.run

    def fail(root, name, argv):
        return real_run(root, name, [sys.executable, "-c", "raise SystemExit(7)"])

    monkeypatch.setattr(checkpoints, "run", fail)
    with pytest.raises(RefactorError, match="failed"):
        runs.execute(preview["id"], "all")
    resumed = runs.load(preview["id"])
    assert resumed["applied"] == 2
    assert resumed["diagnostics"][0]["checkpoint"]["exitCode"] == 7
    runs.execute(preview["id"], "undo")
    assert (Path(preview["projectRoot"]) / "pkg/model/math.py").exists()
    blocked = runs.preview(python_project, CHAIN)
    assert blocked["status"] == "blocked"
    assert (Path(blocked["projectRoot"]) / "pkg/math.py").exists()


def test_checkpoint_refuses_file_writes_and_terminates_timeout(python_project):
    with pytest.raises(RefactorError) as error:
        checkpoints.run(python_project, "mutating", [sys.executable, "-c", "from pathlib import Path; Path('consumer.py').write_text('changed')"])
    assert error.value.diagnostic["code"] == "checkpoint-changed-files"
    with pytest.raises(RefactorError) as error:
        checkpoints.run(python_project, "slow", [sys.executable, "-c", "import time; time.sleep(10)"], timeout=0.1)
    assert error.value.diagnostic["code"] == "checkpoint-timeout"


def test_mutating_preview_retains_evidence_without_overwriting_unknown_content(python_project):
    config = {"checks": {"unit": [sys.executable, "-c", "from pathlib import Path; Path('consumer.py').write_text('# unexpected test edit')"]}}
    (python_project / ".srcly-refactor.json").write_text(json.dumps(config))
    commit(python_project)
    preview = runs.preview(python_project, CHAIN)
    assert preview["status"] == "blocked"
    assert "rollback needs inspection" in preview["error"]
    assert (Path(preview["projectRoot"]) / "consumer.py").read_text() == "# unexpected test edit"
    assert "from pkg.math" in (python_project / "consumer.py").read_text()


def test_checkpoint_cannot_use_an_unconfigured_shell_command(python_project):
    (python_project / ".srcly-refactor.json").write_text(json.dumps({"checks": {"unit": "python -m pytest"}}))
    with pytest.raises(RefactorError, match="argv"):
        checkpoints.resolve(python_project, "unit")


def test_python_cli_uses_the_same_catalog_and_plan(python_project, tmp_path):
    plan = tmp_path / "python.srcly"
    plan.write_text(CHAIN)
    result = subprocess.run(["srcly", "refactor", "preview", str(plan), "--path", str(python_project)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout)["status"] == "ready"
