"""Build a compare payload for two refs: resolve, scan both sides, diff."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Optional

from app.services.compare.diff import diff_sides
from app.services.compare.git_refs import MERGE_BASE, WORKTREE, list_changes, repo_root, resolve_ref
from app.services.compare.snapshots import Side, load_side
from app.services.scan_progress import NULL_OBSERVER, ScanObserver
from app.services.scan_workers import CancelToken

COMPARE_FORMAT = 1

DEFAULT_BASE = MERGE_BASE
DEFAULT_HEAD = WORKTREE


def _side_meta(side: Side) -> dict[str, Any]:
    return {
        "ref": side.ref.ref,
        "sha": side.ref.sha,
        "label": side.ref.label,
        "subject": side.ref.subject,
        "filesTotal": side.files_total,
        "scanSeconds": side.scan_seconds,
        "cached": side.cached,
    }


def build_compare(
    path: Path,
    base: str = DEFAULT_BASE,
    head: str = DEFAULT_HEAD,
    *,
    include_sides: bool = False,
    force: bool = False,
    cancel: Optional[CancelToken] = None,
    observers: Optional[dict[str, ScanObserver]] = None,
    on_phase: Callable[[str], None] = lambda _phase: None,
) -> dict[str, Any]:
    """
    Compare ``base`` → ``head`` for the git repo containing ``path``.

    ``include_sides`` adds both full trees and graphs (what the UI draws);
    the CLI omits them by default to keep the JSON small.
    """
    repo = repo_root(path)
    on_phase("resolving")
    base_ref = resolve_ref(repo, base)
    head_ref = resolve_ref(repo, head)
    changes = list_changes(repo, base_ref, head_ref)

    observers = observers or {}
    on_phase("base")
    base_side = load_side(repo, base_ref, cancel=cancel, observer=observers.get("base", NULL_OBSERVER), force=force)
    on_phase("head")
    head_side = load_side(repo, head_ref, cancel=cancel, observer=observers.get("head", NULL_OBSERVER), force=force)

    on_phase("diffing")
    payload: dict[str, Any] = {
        "format": COMPARE_FORMAT,
        "repo": {"root": str(repo), "name": repo.name},
        "base": _side_meta(base_side),
        "head": _side_meta(head_side),
        **diff_sides(base_side.tree, head_side.tree, base_side.graph, head_side.graph, changes),
    }
    if include_sides:
        payload["trees"] = {"base": base_side.tree, "head": head_side.tree}
        payload["graphs"] = {"base": base_side.graph, "head": head_side.graph}
    return payload


def render_markdown(payload: dict[str, Any], *, limit: int = 40) -> str:
    """A compact human summary of a compare payload for the terminal."""
    base, head, summary = payload["base"], payload["head"], payload["summary"]
    files = summary["files"]
    lines = [
        f"# srcly compare: {base['label']} → {head['label']}",
        "",
        f"{files['total']} files changed: {files['added']} added, {files['removed']} removed, "
        f"{files['modified']} modified, {files['renamed']} renamed "
        f"(+{summary['lines']['additions']} / -{summary['lines']['deletions']} lines)",
        f"Dependency edges: +{summary['edges']['added']} / -{summary['edges']['removed']} "
        f"(cross-folder +{summary['edges']['crossFolderAdded']} / -{summary['edges']['crossFolderRemoved']})",
        f"Net: {summary['net']['better']} metrics better, {summary['net']['worse']} worse, "
        f"{summary['net']['neutral']} size-only, {summary['net']['same']} unchanged",
        "",
        "## Metrics over changed files",
        "",
        "| Metric | Before | After | Δ | Verdict | Files better / worse |",
        "| --- | ---: | ---: | ---: | --- | ---: |",
    ]
    for name, total in summary["metrics"].items():
        lines.append(
            f"| {name} | {_fmt(total['before'])} | {_fmt(total['after'])} | {_signed(total['delta'])} | "
            f"{total['verdict']} | {total['filesBetter']} / {total['filesWorse']} |"
        )
    lines += ["", "## Files", "", "| File | Status | +/- | Worse | Better |", "| --- | --- | ---: | --- | --- |"]
    for f in payload["files"][:limit]:
        worse = ", ".join(f"{k} {_signed(v['delta'])}" for k, v in f["deltas"].items() if v["verdict"] == "worse")
        better = ", ".join(f"{k} {_signed(v['delta'])}" for k, v in f["deltas"].items() if v["verdict"] == "better")
        name = f"{f['oldPath']} → {f['path']}" if f.get("oldPath") else f["path"]
        lines.append(f"| {name} | {f['status']} | +{f['additions']}/-{f['deletions']} | {worse} | {better} |")
    if len(payload["files"]) > limit:
        lines.append(f"| … {len(payload['files']) - limit} more | | | | |")
    return "\n".join(lines) + "\n"


def _fmt(value: Optional[float]) -> str:
    if value is None:
        return "—"
    return f"{value:g}"


def _signed(value: float) -> str:
    return f"{value:+g}"
