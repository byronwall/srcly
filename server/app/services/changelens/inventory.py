"""Changed Git paths, independent of which paths structural analysis can measure."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

from app.services.changelens.chunks import Built
from app.services.changelens.hunks import FileDiff, git, is_skipped, split_lines
from app.services.changelens.models import ChangedPathStatus, LensChangedPath, LensChangedPaths, LensPathDiff, LensSourceLocation
from app.services.changelens.window import EMPTY_TREE, LensError
from app.services.compare.git_refs import GitError

_MAX_FILE_BYTES = 1_000_000
_MAX_DIFF_LINES = 2_000
_STATUS: dict[str, ChangedPathStatus] = {"A": "added", "D": "deleted", "M": "modified", "R": "renamed"}
_WORKTREE_REASON = "Changed paths currently covers committed ranges. Choose Show committed range to exclude working-tree edits."


@dataclass
class _PathHistory:
    first: str
    current: str
    steps: dict[str, FileDiff] = field(default_factory=dict)


@dataclass
class _Row:
    path: str
    old_path: Optional[str]
    net: Optional[FileDiff]
    steps: dict[str, FileDiff]
    id: str
    unpaired: bool = False

    @property
    def status(self) -> ChangedPathStatus:
        if self.net:
            return _STATUS[self.net.status]
        if self.unpaired:
            return "renamed" if self.old_path else "modified"
        return "reverted"


def _row_id(old_path: Optional[str], new_path: Optional[str]) -> str:
    # Two paths disambiguate a removed path and a replacement that renamed onto it.
    return json.dumps((old_path, new_path), ensure_ascii=False, separators=(",", ":"))


def _histories(built: Built) -> list[_PathHistory]:
    rows: list[_PathHistory] = []
    by_path: dict[str, _PathHistory] = {}
    for sha, diffs in built.path_steps:
        prior, after = by_path, dict(by_path)
        moved: list[tuple[FileDiff, _PathHistory]] = []
        for d in diffs:
            if not d.path:
                continue
            start = d.old_path or d.path
            row = prior.get(start)
            if row is None:
                row = _PathHistory(start, d.path)
                rows.append(row)
            row.steps[sha] = d
            if d.old_path and d.old_path != d.new_path and d.new_path:
                after.pop(d.old_path, None)
            row.current = d.path
            moved.append((d, row))
        # A destination that is present after this commit wins over a deleted
        # predecessor at the same path, independent of Git's raw record order.
        for d, row in sorted(moved, key=lambda entry: entry[0].new_path is not None):
            # Keep a deletion indexed at its path, so a later recreation of
            # that path belongs to the same logical file in Touched.
            after[d.path] = row
        by_path = after
    return rows


def _rows(built: Built) -> list[_Row]:
    net = [d for d in built.path_net if d.path]
    by_pair = {(d.old_path, d.new_path): d for d in net}
    net_paths = {p for d in net for p in (d.old_path, d.new_path) if p}
    hist = _histories(built)
    by_endpoint: dict[tuple[Optional[str], Optional[str]], dict[str, FileDiff]] = {}
    touched: list[_Row] = []
    for line in hist:
        changes = list(line.steps.values())
        old = line.first if changes[0].old_path else None
        new = line.current if changes[-1].new_path else None
        key = (old, new)
        effective = by_pair.get(key)
        if effective is not None:
            by_endpoint[key] = line.steps
        path = line.current
        prior = line.first if line.first != path else None
        # Transient additions/deletions have neither endpoint; retain their
        # visited identity instead of grouping them under one empty key.
        row_id = _row_id(old, new) if old or new else _row_id(line.first, line.current)
        visited = {p for d in changes for p in (d.old_path, d.new_path) if p}
        touched.append(_Row(path, prior, effective, line.steps, row_id, not effective and bool(visited & net_paths)))
    if built.mode == "touched":
        rows = touched
    else:
        rows = [
            _Row(d.path, d.old_path if d.status == "R" else None, d, by_endpoint.get((d.old_path, d.new_path), {}), _row_id(d.old_path, d.new_path))
            for d in net
        ]
    used: set[str] = set()
    for row in rows:
        base_id, ordinal = row.id, 2
        while row.id in used:
            row.id = f"{base_id}~{ordinal}"
            ordinal += 1
        used.add(row.id)
    return sorted(rows, key=lambda row: (row.path, row.old_path or "", row.id))


def _window_compare_reason(built: Built) -> Optional[str]:
    if built.window.upstream_tree is not None:
        return "Compare cannot open the effective base tree with upstream merges applied."
    if built.window.base.sha is None:
        return "Compare needs two commits; this window starts at the empty tree."
    return None


def payload(built: Built) -> LensChangedPaths:
    if built.has_worktree or built.scoped_worktree_dirty:
        return LensChangedPaths(
            rows=[], base_revision=None, head_revision=None,
            compare_unavailable_reason=_WORKTREE_REASON, unavailable_reason=_WORKTREE_REASON,
        )
    by_path = {f.path: f for f in built.files}
    rows: list[LensChangedPath] = []
    for row in _rows(built):
        structural = by_path.get(row.path)
        chunks = [built.drafts[c].chunk for c in structural.chunk_ids if c in built.drafts] if structural else []
        measured = any(chunk and chunk.measured and any(
            m.before is not None or m.after is not None for m in chunk.metrics.values()
        ) for chunk in chunks)
        reason = None
        if not measured:
            diffs = [*row.steps.values(), *([row.net] if row.net else [])]
            if diffs and all(not d.regular for d in diffs):
                reason = "Non-regular Git entries have no structural metrics."
            elif diffs and all(d.binary for d in diffs):
                reason = "Binary contents have no structural metrics."
            elif diffs and all(d.old_sha == d.new_sha and d.old_mode != d.new_mode for d in diffs):
                reason = "File mode changed without a source edit."
            elif is_skipped(row.path):
                reason = "This path is excluded by Srcly's structural scan rules."
            else:
                reason = next((c.na_reason for c in chunks if c and c.na_reason), "No structural metrics were measured for this path.")
        rows.append(LensChangedPath(
            id=row.id, path=row.path, old_path=row.old_path, status=row.status,
            commits=list(row.steps), has_net_diff=row.net is not None, measured=measured, metric_reason=reason,
        ))
    return LensChangedPaths(
        rows=rows, base_revision=built.window.base_tree, head_revision=built.window.tip.sha,
        compare_unavailable_reason=_window_compare_reason(built), unavailable_reason=None,
    )


def path_diff(built: Built, row_id: str, commit: Optional[str] = None) -> LensPathDiff:
    if built.has_worktree or built.scoped_worktree_dirty:
        raise LensError(_WORKTREE_REASON, status=409)
    row = next((r for r in _rows(built) if r.id == row_id), None)
    if row is None:
        raise LensError("No changed path with that id in this selection", status=404)
    window = built.window
    diff = row.net
    base, head = window.base_tree, window.tip.sha
    from_label, to_label = window.base.label, window.tip.label
    if window.upstream_tree is not None:
        from_label = f"Effective base tree {base[:7]}"
    compare_reason = _window_compare_reason(built)
    if commit is not None:
        if len(commit) < 7:
            raise LensError("commit needs a sha of 7 characters or more")
        matches = [c for c in window.commits if c.sha.startswith(commit) and c.sha in row.steps]
        if len(matches) != 1:
            raise LensError("No unique touching commit in this selection", status=404)
        c = matches[0]
        diff = row.steps[c.sha]
        base, head = c.parents[0] if c.parents else EMPTY_TREE, c.sha
        from_label, to_label = f"{base[:7]}" if c.parents else "Empty tree", c.short
        compare_reason = None if c.parents else "Compare needs two commits; this commit starts at the empty tree."

    receipt = LensPathDiff(
        id=row.id, path=diff.path if diff else row.path,
        old_path=diff.old_path if diff and diff.status == "R" else row.old_path if diff is None else None,
        status=_STATUS[diff.status] if diff else row.status,
        from_=from_label, to=to_label, base_revision=base, head_revision=head,
        compare_unavailable_reason=compare_reason,
    )
    if diff is None:
        if row.unpaired:
            receipt.reason = "Git changed these endpoint paths but did not pair them as one file. Choose a touching commit for this path's evidence."
            receipt.compare_unavailable_reason = receipt.reason
        else:
            receipt.reason = "No endpoint diff: this path was touched in the window but is unchanged between the effective endpoints. Choose a touching commit."
        return receipt
    if not diff.regular:
        receipt.reason = "This is a non-regular Git entry (such as a symlink or submodule); text evidence is unavailable."
        return receipt
    if diff.binary:
        receipt.reason = "Binary file; no text diff or source is available."
        return receipt
    if diff.old_sha == diff.new_sha and diff.old_mode != diff.new_mode and diff.old_path == diff.new_path:
        receipt.reason = "Mode-only change; file contents are unchanged."
        return receipt
    try:
        for sha in dict.fromkeys((diff.old_sha, diff.new_sha)):
            if sha and int(git(window.repo, "cat-file", "-s", sha).strip()) > _MAX_FILE_BYTES:
                receipt.reason = "File is above the 1 MB text evidence limit."
                return receipt
        if not diff.hunks:
            receipt.reason = ("Rename only; file contents are unchanged." if diff.status == "R" else "No text lines changed.")
        else:
            paths = list(dict.fromkeys(p for p in (diff.old_path, diff.new_path) if p))
            raw = git(window.repo, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "-U3",
                      base, head, "--", *(f":(literal){p}" for p in paths))
            lines = split_lines(raw)
            receipt.truncated = len(lines) > _MAX_DIFF_LINES
            receipt.diff = "\n".join(line.removesuffix("\r") for line in lines[:_MAX_DIFF_LINES]) + ("\n" if lines else "")
            if not receipt.diff:
                receipt.reason = "No readable text diff is available at these revisions."
                return receipt
    except (GitError, ValueError):
        receipt.reason = "Historical source is unavailable at the selected revision; the working tree was not used."
        return receipt

    for side, name, revision in (("base", diff.old_path, base), ("head", diff.new_path, head)):
        if not name:
            continue
        ranges = [(h.old_start, h.old_lines) if side == "base" else (h.new_start, h.new_lines) for h in diff.hunks]
        start, count = next(((s, n) for s, n in ranges if s > 0 and n > 0), (1, 1))
        source = LensSourceLocation(repo_root=str(window.repo), path=name, side=side, revision=revision,
                                    start_line=start, end_line=start + count - 1)
        if side == "base":
            receipt.base_source = source
        else:
            receipt.head_source = source
    return receipt
