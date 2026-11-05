"""The real compiler and journal: a chain must preview, execute and undo exactly."""
import json
import shutil
from pathlib import Path

import pytest

from app.services.compare.git_refs import run_git
from app.services.refactor import runs
from app.services.refactor.plan import RefactorError, parse


@pytest.fixture
def project(tmp_path, monkeypatch):
    if not shutil.which("node"):
        pytest.skip("Node is required for the TypeScript refactoring acceptance test")
    monkeypatch.setenv("SRCLY_ENGINE_DEV", "1")
    monkeypatch.setattr(runs, "directory", lambda: tmp_path / "runs")
    root = tmp_path / "repo"
    root.mkdir()
    files = {
        "tsconfig.json": json.dumps({"compilerOptions": {"strict": True, "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "preserve", "baseUrl": ".", "paths": {"@/*": ["src/*"]}}, "include": ["src"]}),
        "src/state.ts": "export const count = 1;\n",
        "src/index.ts": 'export { count } from "./state";\n',
        "src/App.tsx": 'import { count } from "@/state";\nexport const App = () => <div>{count}</div>;\n',
        "src/jsx.d.ts": "declare namespace JSX { interface IntrinsicElements { div: { children?: unknown } } }\n",
    }
    for name, content in files.items():
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)
    run_git(root, "init", "-q")
    run_git(root, "config", "user.email", "test@srcly.invalid")
    run_git(root, "config", "user.name", "Srcly test")
    run_git(root, "add", ".")
    run_git(root, "commit", "-qm", "fixture")
    return root


CHAIN = '''refactor 1
project "tsconfig.json"
let state = file "src/state.ts"
move-file $state -> "src/model/state.ts"
move-file $state -> "src/domain/session.ts"
'''


def test_file_moves_preview_replay_undo_and_resume(project):
    before = runs.fingerprint(project)
    preview = runs.preview(project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    assert len(preview["steps"]) == 2
    assert all(step["diagnostics"] == [] for step in preview["steps"])
    assert {f["path"] for f in preview["steps"][0]["files"]} == {"src/state.ts", "src/model/state.ts", "src/index.ts", "src/App.tsx"}
    work = Path(preview["projectRoot"])
    assert (work / "src/state.ts").exists()
    first = runs.execute(preview["id"], "next")
    assert first["applied"] == 1
    assert (work / "src/model/state.ts").read_text() == "export const count = 1;\n"
    assert not (work / "src/state.ts").exists()
    complete = runs.execute(preview["id"], "all")
    assert complete["status"] == "complete"
    assert (work / "src/domain/session.ts").exists()
    assert "domain/session" in (work / "src/index.ts").read_text()
    assert "domain/session" in (work / "src/App.tsx").read_text()
    assert runs.load(preview["id"])["applied"] == 2
    runs.execute(preview["id"], "undo")
    assert (work / "src/model/state.ts").exists()
    runs.execute(preview["id"], "undo")
    assert runs.fingerprint(work) == before
    assert runs.fingerprint(project) == before
    assert run_git(project, "status", "--porcelain") == ""


def test_stale_source_and_unknown_worktree_edits_block_without_overwrite(project):
    preview = runs.preview(project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    target = project / "src/state.ts"
    target.write_text("export const count = 2;\n")
    with pytest.raises(RefactorError, match="uncommitted"):
        runs.execute(preview["id"], "next")
    target.write_text("export const count = 1;\n")
    work = Path(preview["projectRoot"])
    (work / "src/other.ts").write_text("// user's own work\n")
    with pytest.raises(RefactorError, match="outside this run"):
        runs.execute(preview["id"], "next")
    assert (work / "src/state.ts").exists()
    assert (work / "src/other.ts").read_text() == "// user's own work\n"


def test_dependency_links_remain_ignored_by_directory_patterns(project):
    (project / ".gitignore").write_text("node_modules/\n")
    dependency = project / "node_modules/example"
    dependency.mkdir(parents=True)
    (dependency / "package.json").write_text('{"name":"example"}')
    run_git(project, "add", ".gitignore")
    run_git(project, "commit", "-qm", "directory ignore fixture")
    preview = runs.preview(project, CHAIN)
    assert preview["status"] == "ready", preview["error"]
    work = Path(preview["projectRoot"])
    assert not (work / "node_modules").is_symlink()
    assert (work / "node_modules/example").is_symlink()
    assert run_git(work, "status", "--porcelain") == ""
    runs.execute(preview["id"], "next")
    runs.execute(preview["id"], "undo")
    assert run_git(work, "status", "--porcelain") == ""


def test_failed_chain_restores_preview_and_is_never_executable(project):
    source = CHAIN + 'move-file $state -> "src/App.tsx"\n'
    preview = runs.preview(project, source)
    assert preview["status"] == "blocked"
    assert "Destination already exists" in preview["error"]
    work = Path(preview["projectRoot"])
    assert (work / "src/state.ts").exists()
    assert not (work / "src/domain/session.ts").exists()
    with pytest.raises(RefactorError, match="no executable preview"):
        runs.execute(preview["id"], "all")


def test_write_ahead_journal_recovers_interrupted_step(project):
    preview = runs.preview(project, CHAIN)
    run = runs.load(preview["id"])
    run["pending"] = {"index": 0, "reverse": False}
    runs.save(run)
    changes = run["steps"][0]["changes"]
    work = Path(run["projectRoot"])
    runs.write_changes(work, changes[:1])
    recovered = runs.load(run["id"])
    assert recovered["applied"] == 0
    assert runs.fingerprint(work) == runs.fingerprint(project)
    assert runs.execute(run["id"], "all")["status"] == "complete"


@pytest.mark.parametrize("source", [
    'refactor 1\nmove-file "../outside.ts" -> "src/a.ts"',
    'refactor 1\nmove-file $missing -> "src/a.ts"',
    'refactor 1\nmove-file "src/a.ts" -> ".git/config"',
    'refactor 1\nmove-file "src/a.ts" -> "node_modules/a.ts"',
    'refactor 2\nmove-file "src/a.ts" -> "src/b.ts"',
])
def test_invalid_plans_fail_with_line_context(source):
    with pytest.raises(RefactorError, match="Line"):
        parse(source)


def test_symlink_destination_is_refused(project, tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    (work / "escape").symlink_to(project, target_is_directory=True)
    with pytest.raises(RefactorError, match="symlink"):
        runs.contained(work, "escape/src/state.ts")


def test_agent_api_exposes_grammar_and_structured_plan_diagnostics():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        catalog = client.get("/api/refactor/catalog").json()
        assert catalog["operations"][0]["name"] == "move-file"
        response = client.post("/api/refactor/parse", json={"path": "/unused", "source": 'refactor 1\nmove-file $missing -> "src/new.ts"'})
        assert response.status_code == 409
        diagnostic = response.json()["detail"]
        assert diagnostic["code"] == "invalid-plan"
        assert diagnostic["line"] == 2
        assert "Unknown handle" in diagnostic["message"]
