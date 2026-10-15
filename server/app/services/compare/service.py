"""Build a compare payload for two refs: resolve, scan both sides, diff."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from app.services.compare.diff import diff_sides
from app.services.compare.git_refs import (
    AUTO,
    MERGE_BASE,
    WORKTREE,
    list_changes,
    repo_root,
    resolve_auto_base,
    resolve_ref,
)
from app.services.compare.snapshots import Side, load_side
from app.services.scan_progress import NULL_OBSERVER, ScanObserver
from app.services.scan_workers import CancelToken

COMPARE_FORMAT = 1

DEFAULT_BASE = MERGE_BASE
DEFAULT_HEAD = WORKTREE


class StepTimer:
    """
    Wall-clock seconds per named step, in groups (``phases``, ``base``, ``head``).
    Entering a step closes the group's running one; a snapshot includes the
    running step's time so far, so progress can show it live.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._done: dict[str, dict[str, float]] = {}
        self._running: dict[str, tuple[str, float]] = {}

    def enter(self, group: str, step: Optional[str]) -> None:
        now = time.monotonic()
        with self._lock:
            running = self._running.pop(group, None)
            if running is not None:
                name, since = running
                steps = self._done.setdefault(group, {})
                steps[name] = steps.get(name, 0.0) + now - since
            if step is not None:
                self._running[group] = (step, now)
                self._done.setdefault(group, {})

    def close(self, group: str) -> None:
        self.enter(group, None)

    def close_all(self) -> None:
        for group in list(self._running):
            self.close(group)

    def snapshot(self) -> dict[str, dict[str, float]]:
        now = time.monotonic()
        with self._lock:
            out = {group: dict(steps) for group, steps in self._done.items()}
            for group, (name, since) in self._running.items():
                steps = out.setdefault(group, {})
                steps[name] = steps.get(name, 0.0) + now - since
        return {group: {k: round(v, 3) for k, v in steps.items()} for group, steps in out.items()}


def _side_meta(side: Side) -> dict[str, Any]:
    meta = {
        "ref": side.ref.ref,
        "sha": side.ref.sha,
        "label": side.ref.label,
        "subject": side.ref.subject,
        "filesTotal": side.files_total,
        "scanSeconds": side.scan_seconds,
        "cached": side.cached,
    }
    if side.ref.pr is not None:
        meta["pr"] = side.ref.pr
    if side.ref.dir is not None:
        meta["dir"] = str(side.ref.dir)
    return meta


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
    timer: Optional[StepTimer] = None,
) -> dict[str, Any]:
    """
    Compare ``base`` → ``head`` for the git repo containing ``path``.

    ``include_sides`` adds both full trees and graphs (what the UI draws);
    the CLI omits them by default to keep the JSON small.
    """
    timer = timer or StepTimer()

    def phase(name: str) -> None:
        on_phase(name)
        timer.enter("phases", name)

    repo = repo_root(path)
    phase("resolving")
    head_ref = resolve_ref(repo, head, side="head")
    base_ref = resolve_auto_base(repo, head, head_ref) if base == AUTO else resolve_ref(repo, base, side="base")
    changes = list_changes(repo, base_ref, head_ref)

    observers = observers or {}
    sides: dict[str, Side] = {}
    for name, ref in (("base", base_ref), ("head", head_ref)):
        phase(name)
        sides[name] = load_side(
            repo,
            ref,
            cancel=cancel,
            observer=observers.get(name, NULL_OBSERVER),
            force=force,
            on_step=lambda step, name=name: timer.enter(name, step),
        )
        timer.close(name)
    base_side, head_side = sides["base"], sides["head"]

    phase("diffing")
    payload: dict[str, Any] = {
        "format": COMPARE_FORMAT,
        "repo": {"root": str(repo), "name": repo.name},
        "base": _side_meta(base_side),
        "head": _side_meta(head_side),
        **diff_sides(base_side.tree, head_side.tree, base_side.graph, head_side.graph, changes),
    }
    timer.close_all()
    payload["timings"] = timer.snapshot()
    if include_sides:
        payload["trees"] = {"base": base_side.tree, "head": head_side.tree}
        payload["graphs"] = {"base": base_side.graph, "head": head_side.graph}
    return payload


def render_markdown(payload: dict[str, Any], *, limit: int = 40) -> str:
    """A compact human summary of a compare payload for the terminal."""
    base, head, summary = payload["base"], payload["head"], payload["summary"]
    files = summary["files"]
    lines = [f"# srcly compare: {base['label']} → {head['label']}", ""]
    pr = head.get("pr") or base.get("pr")
    if pr:
        lines += [f"PR #{pr['number']} {pr['title']}: {pr['headRefName']} → {pr['baseRefName']} ({pr['url']})", ""]
    lines += [
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
