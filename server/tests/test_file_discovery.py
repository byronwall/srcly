import subprocess
from pathlib import Path

import pytest

from app.routers import analysis as analysis_router
from app.services import analysis


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


def _write(path: Path, text: str | bytes = "x = 1\n") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(text, bytes):
        path.write_bytes(text)
    else:
        path.write_text(text)
    return path


def _rel(root: Path, files: list[str]) -> list[str]:
    return sorted(Path(f).relative_to(root.resolve()).as_posix() for f in files)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-q")
    _write(root / "src" / "app.py")
    _write(root / ".gitignore", "*.log\n")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "init")
    return root


def test_git_discovery_honors_info_exclude_and_global_excludes(repo: Path, tmp_path: Path) -> None:
    # Like explorEDA: agent worktrees excluded only through .git/info/exclude.
    _write(repo / ".claude" / "worktrees" / "wt1" / "src" / "app.py")
    _write(repo / ".git" / "info" / "exclude", ".claude/worktrees/\n")
    global_excludes = _write(tmp_path / "global-excludes", "*.scratch.py\n")
    _git(repo, "config", "core.excludesFile", str(global_excludes))
    _write(repo / "notes.scratch.py")
    _write(repo / "src" / "untracked.py")

    result = analysis.discover_files(repo)

    assert result.used_git
    assert _rel(repo, result.files) == [".gitignore", "src/app.py", "src/untracked.py"]


def test_git_discovery_skips_deleted_tracked_files_and_builtin_dirs(repo: Path) -> None:
    _write(repo / "src" / "gone.py")
    _write(repo / "node_modules" / "pkg" / "index.py")
    _write(repo / "scripts" / "build", "#!/bin/sh\necho hi\n")
    _git(repo, "add", "-A", "-f")
    _git(repo, "commit", "-q", "-m", "more")
    (repo / "src" / "gone.py").unlink()

    result = analysis.discover_files(repo)

    # node_modules is pruned like the walk does even when committed; a *file*
    # named like an ignored dir ("build") is kept.
    assert _rel(repo, result.files) == [".gitignore", "scripts/build", "src/app.py"]



@pytest.mark.parametrize("use_git", [True, False])
def test_tool_output_dirs_are_skipped(monkeypatch, repo: Path, use_git: bool) -> None:
    if not use_git:
        monkeypatch.setattr(analysis, "_is_inside_git_work_tree", lambda _path: False)
    # Playwright MCP leaves hundreds of snapshot and console files at the root.
    _write(repo / ".playwright-mcp" / "page-2026-10-16T05-25-10-089Z.yml", "- button\n")
    _write(repo / ".playwright-mcp" / "console-2026-10-16T14-54-17-360Z.log", "[log] hi\n")
    _write(repo / "test-results" / "run" / "trace.md", "# trace\n")

    result = analysis.discover_files(repo)

    assert _rel(repo, result.files) == [".gitignore", "src/app.py"]

def test_git_discovery_descends_into_nested_repositories(repo: Path) -> None:
    nested = repo / "vendor-repo"
    nested.mkdir()
    _git(nested, "init", "-q")
    _write(nested / "lib.py")
    _write(nested / ".gitignore", "secret.py\n")
    _write(nested / "secret.py")

    result = analysis.discover_files(repo)

    assert "vendor-repo/lib.py" in _rel(repo, result.files)
    assert "vendor-repo/secret.py" not in _rel(repo, result.files)


def test_binary_files_are_skipped(repo: Path) -> None:
    _write(repo / "engine" / "stockfish.wasm", b"\0asm\x01\0\0\0")
    _write(repo / "engine" / "blob", b"ELF\0\0\0binary")
    _write(repo / "engine" / "readme.md", "# engine\n")

    result = analysis.discover_files(repo)

    assert "engine/readme.md" in _rel(repo, result.files)
    assert not any(f.startswith("engine/stockfish") or f == "engine/blob" for f in _rel(repo, result.files))
    assert result.skipped_binary == 2


def test_minified_bundles_are_skipped(repo: Path) -> None:
    long_line = "var a=function(b){return b+1};" * 400
    _write(repo / "assets" / "index-Cz998m0t.js", long_line + "\n" + long_line)
    _write(repo / "assets" / "index-Cz998m0t.css", ".a{color:red}" * 1000)
    _write(repo / "assets" / "vendor.min.js", "x")
    hand_written = "\n".join(f"export const v{i} = {i};" for i in range(500))
    _write(repo / "assets" / "app.js", hand_written)

    result = analysis.discover_files(repo)

    assert [f for f in _rel(repo, result.files) if f.startswith("assets/")] == ["assets/app.js"]
    assert result.skipped_minified == 2


def test_walk_fallback_applies_same_filters(monkeypatch, tmp_path: Path) -> None:
    root = tmp_path / "plain"
    _write(root / "a.py")
    _write(root / "b.wasm", b"\0asm")
    _write(root / "bundle.js", ("x=1;" * 2000) + "\n")
    _write(root / "lib.min.js", "x")
    _write(root / ".gitignore", "skip.py\n")
    _write(root / "skip.py")
    monkeypatch.setattr(analysis, "_is_inside_git_work_tree", lambda _path: False)

    result = analysis.discover_files(root)

    assert not result.used_git
    assert _rel(root, result.files) == [".gitignore", "a.py"]
    assert result.skipped_binary == 1
    assert result.skipped_minified == 1
    assert result.ignored_counts == {str(root.resolve()): 1}


@pytest.mark.parametrize("use_git", [True, False])
def test_gitignored_count_rolls_up_to_folders(monkeypatch, repo: Path, use_git: bool) -> None:
    if not use_git:
        monkeypatch.setattr(analysis, "_is_inside_git_work_tree", lambda _path: False)
    _write(repo / "src" / "debug.log", "log\n")
    _write(repo / "src" / "deep" / "x.py")
    _write(repo / "src" / "deep" / "a.log", "log\n")
    _write(repo / "src" / "deep" / "b.log", "log\n")
    # No analyzable files here, but its ignored file still counts upward.
    _write(repo / "logs" / "only.log", "log\n")

    root_node = analysis.scan_codebase(repo, verbose=False)

    by_name = {c.name: c for c in root_node.children}
    src = by_name["src"]
    deep = next(c for c in src.children if c.name == "deep")
    assert deep.metrics.gitignored_count == 2
    assert src.metrics.gitignored_count == 3
    assert root_node.metrics.gitignored_count == 4


def test_landing_estimate_matches_scan(repo: Path) -> None:
    _write(repo / ".claude" / "worktrees" / "wt1" / "app.py")
    _write(repo / ".git" / "info" / "exclude", ".claude/\n")
    _write(repo / "pkg" / "sub" / "mod.py")
    _write(repo / "pkg" / "logo.wasm", b"\0asm")

    file_count, folder_count = analysis_router._estimate_counts(repo)
    root_node = analysis.scan_codebase(repo, verbose=False)

    def count_folders(node) -> int:
        return sum(1 + count_folders(c) for c in node.children if c.type == "folder")

    assert file_count == root_node.metrics.file_count == 3
    assert folder_count == count_folders(root_node) == 3
