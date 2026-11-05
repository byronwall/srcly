"""``srcly fix``: apply the safe fixes that findings carry.

A fix is byte-offset text edits into one file, or the deletion of the file.
Edits are applied from the end of the file backwards; a fix whose edits
overlap an earlier fix in the same file is skipped and reported. Deleting a
file happens only when the caller asks for its rule by name.
"""

from __future__ import annotations

import difflib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from app.services.findings.model import Finding

DELETE_RULES = frozenset({"unreachable-file"})
"""Rules whose fix deletes a file: only applied when named with ``--rule``."""


def fix_tools(root: Path):
    """The tools whose findings carry fixes."""
    from app.services.findings.reachability import ReachabilityTool
    from app.services.findings.solid import SolidTool

    return [ReachabilityTool(root), SolidTool(root)]


@dataclass
class FixPlan:
    """What ``srcly fix`` would do."""

    changed: dict[str, bytes] = field(default_factory=dict)
    """Path → new content."""
    original: dict[str, bytes] = field(default_factory=dict)
    deleted: list[str] = field(default_factory=list)
    applied: list[Finding] = field(default_factory=list)
    skipped: list[tuple[Finding, str]] = field(default_factory=list)
    held: list[Finding] = field(default_factory=list)
    """Delete fixes left out because their rule was not named."""


def plan(findings: Iterable[Finding], rules: Optional[set[str]] = None) -> FixPlan:
    out = FixPlan()
    by_file: dict[str, list[Finding]] = {}
    for f in findings:
        if f.fix is None or (rules and f.rule not in rules):
            continue
        if f.fix.get("delete"):
            if not rules or f.rule not in rules or f.rule not in DELETE_RULES:
                out.held.append(f)
                continue
            out.deleted.append(f.path)
            out.applied.append(f)
            continue
        by_file.setdefault(f.path, []).append(f)

    for path, fs in sorted(by_file.items()):
        if path in out.deleted:
            continue
        try:
            data = Path(path).read_bytes()
        except OSError as exc:
            out.skipped.extend((f, f"could not read: {exc}") for f in fs)
            continue
        taken: list[tuple[int, int]] = []
        edits: dict[tuple[int, int, str], None] = {}
        for f in sorted(fs, key=lambda f: (f.line, f.column)):
            own = [(e["start"], e["end"], e["text"]) for e in f.fix["edits"] if (e["start"], e["end"], e["text"]) not in edits]
            # Same edit as an earlier fix (the shared import) is fine; any other touch is not.
            if any(s < te and ts < e or s == ts for s, e, _ in own for ts, te in taken):
                out.skipped.append((f, "overlaps another fix; run `srcly fix` again"))
                continue
            for s, e, text in own:
                edits[(s, e, text)] = None
                taken.append((s, e))
            out.applied.append(f)
        new = data
        for s, e, text in sorted(edits, key=lambda x: (x[0], x[1]), reverse=True):
            new = new[:s] + text.encode("utf-8") + new[e:]
        if new != data:
            out.original[path] = data
            out.changed[path] = new
    return out


def diff(fix_plan: FixPlan, root: Path) -> str:
    chunks: list[str] = []

    def rel(p: str) -> str:
        try:
            return Path(p).relative_to(root).as_posix()
        except ValueError:
            return p

    for path, new in sorted(fix_plan.changed.items()):
        old = fix_plan.original[path].decode("utf-8", "replace").splitlines(keepends=True)
        chunks.extend(difflib.unified_diff(old, new.decode("utf-8", "replace").splitlines(keepends=True), f"a/{rel(path)}", f"b/{rel(path)}"))
    for path in sorted(fix_plan.deleted):
        try:
            old = Path(path).read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
        except OSError:
            old = []
        chunks.extend(difflib.unified_diff(old, [], f"a/{rel(path)}", "/dev/null"))
    return "".join(c if c.endswith("\n") else c + "\n" for c in chunks)


def write(fix_plan: FixPlan) -> None:
    for path, new in fix_plan.changed.items():
        Path(path).write_bytes(new)
    for path in fix_plan.deleted:
        os.remove(path)


def run(root: Path, rules: Optional[set[str]] = None, apply: bool = False) -> str:
    """Plan the fixes for ``root``, write them when ``apply``, and return what to print."""
    from app.services.findings.runner import run_tools

    root = root.resolve()
    result = run_tools(root, fix_tools(root))
    failed = [t.reason for t in result.tools if not t.ok]
    fix_plan = plan(result.findings, rules)
    lines = [diff(fix_plan, root)] if not apply else []
    if apply:
        write(fix_plan)
    files = len(fix_plan.changed) + len(fix_plan.deleted)
    verb = "Applied" if apply else "Would apply"
    lines.append(f"{verb} {len(fix_plan.applied)} fixes in {files} files.")
    for f, why in fix_plan.skipped:
        lines.append(f"Skipped {f.rule} at {Path(f.path).relative_to(root).as_posix()}:{f.line}: {why}")
    if fix_plan.held:
        lines.append(
            f"{len(fix_plan.held)} unreachable files can be deleted: check them, then run "
            "`srcly fix --rule unreachable-file --write`."
        )
    lines.extend(f"Not checked: {reason}" for reason in failed)
    if not apply and fix_plan.applied:
        lines.append("Run again with --write to apply.")
    return "\n".join(line for line in lines if line)
