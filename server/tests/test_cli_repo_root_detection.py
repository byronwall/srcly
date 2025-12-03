import os
from pathlib import Path

from app.run import _find_repo_root
from app.services.analysis import find_repo_root


def test_find_repo_root_cli_starts_in_repo_root(tmp_path: Path) -> None:
    """CLI helper should return the current dir if it is a repo root."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()

    result = _find_repo_root(str(repo_root))
    assert Path(result) == repo_root


def test_find_repo_root_cli_from_subdirectory(tmp_path: Path) -> None:
    """CLI helper should walk upwards to the enclosing repo root."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    subdir = repo_root / "subdir" / "nested"
    subdir.mkdir(parents=True)

    result = _find_repo_root(str(subdir))
    assert Path(result) == repo_root


def test_find_repo_root_cli_no_git_falls_back_to_start(tmp_path: Path) -> None:
    """CLI helper should fall back to the original start path when no .git is found."""
    start = tmp_path / "no_repo"
    start.mkdir()

    result = _find_repo_root(str(start))
    assert Path(result) == start.resolve()


def test_find_repo_root_analysis_starts_in_repo_root(tmp_path: Path) -> None:
    """Analysis helper should return the current dir if it is a repo root."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()

    result = find_repo_root(repo_root)
    assert result == repo_root.resolve()


def test_find_repo_root_analysis_from_subdirectory(tmp_path: Path) -> None:
    """Analysis helper should walk upwards to the enclosing repo root."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".git").mkdir()
    subdir = repo_root / "subdir" / "nested"
    subdir.mkdir(parents=True)

    result = find_repo_root(subdir)
    assert result == repo_root.resolve()


def test_find_repo_root_analysis_no_git_falls_back_to_start(tmp_path: Path) -> None:
    """Analysis helper should fall back to the original start path when no .git is found."""
    start = tmp_path / "no_repo"
    start.mkdir()

    result = find_repo_root(start)
    assert result == start.resolve()


