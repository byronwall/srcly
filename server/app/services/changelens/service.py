"""Change Lens payload, hunk diff text, and the Markdown summary the CLI prints."""

from __future__ import annotations

import os
from collections import OrderedDict, defaultdict
from pathlib import Path
from typing import Optional

from app.services.changelens import chunks as engine
from app.services.changelens import textdiff
from app.services.changelens.blobs import BlobRef, Scope
from app.services.changelens.chunks import Built, Lineage
from app.services.changelens.hunks import GIT_TIMEOUT, Hunk, is_skipped, split_lines
from app.services.changelens.models import (
    WORKTREE,
    ChangeLensPayload,
    LensBranch,
    LensEndpoint,
    LensHunkDiff,
    LensSelection,
    LensSummary,
)
from app.services.changelens.window import LensError, Params, Window, iso, local_timezone, resolve
from app.services.compare.git_refs import GitError, run_git

MAX_DIFF_LINES = 2000
CACHE_SIZE = 8

_cache: OrderedDict[tuple, tuple[Built, int]] = OrderedDict()


def clear_cache() -> None:
    _cache.clear()


def _pathspec(scope: str) -> list[str]:
    return ["--", scope] if scope else []


def _worktree_print(window: Window) -> tuple:
    """Changes when any uncommitted edit does: the status lines, and each listed file's size and mtime."""
    status = run_git(
        window.repo, "status", "--porcelain=v1", "-z", "--untracked-files=all", *_pathspec(window.scope), timeout=GIT_TIMEOUT
    )
    stats = []
    for entry in status.split("\0"):
        try:
            stat = os.stat(window.repo / entry[3:])
            stats.append((stat.st_mtime_ns, stat.st_size))
        except OSError:
            stats.append(None)
    return (status, tuple(stats))


def _files_total(window: Window, has_worktree: bool) -> int:
    if has_worktree:
        raw = run_git(
            window.repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard", *_pathspec(window.scope), timeout=GIT_TIMEOUT
        )
        paths = {p for p in raw.split("\0") if p and (window.repo / p).is_file()}
    else:
        raw = run_git(window.repo, "ls-tree", "-r", "-z", "--name-only", window.tip.sha, *_pathspec(window.scope), timeout=GIT_TIMEOUT)
        paths = {p for p in raw.split("\0") if p}
    return sum(1 for p in paths if not is_skipped(p))


def build_lens(path: Path, params: Params) -> tuple[Built, int]:
    """The built window and the count of files at its head. Cached until a commit or an uncommitted edit changes."""
    try:
        window = resolve(Path(path), params)
        key = (
            str(window.repo),
            window.scope,
            params.mode,
            window.base_tree,
            window.tip.sha,
            tuple((c.sha, c.upstream_merge) for c in window.commits),
            _worktree_print(window) if window.wants_worktree else None,
        )
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
            hit[0].window = window
            return hit
        built = engine.build(window, params.mode)
        result = (built, _files_total(window, built.has_worktree))
    except GitError as exc:
        raise LensError(str(exc)) from exc
    _cache[key] = result
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return result


def _head_endpoint(built: Built) -> LensEndpoint:
    tip = built.window.tip
    if built.has_worktree:
        return LensEndpoint(ref=WORKTREE, sha=None, label=f"Working tree on {tip.label}", date=None)
    return LensEndpoint(ref=tip.ref, sha=tip.sha, label=tip.label, date=iso(tip.ts))


def build_payload(path: Path, params: Params) -> dict:
    if params.mode not in ("touched", "net"):
        raise LensError(f"Unknown mode: {params.mode}")
    built, files_total = build_lens(path, params)
    window = built.window
    notes = [*window.notes, *built.notes]
    if built.left_out:
        plural = "s" if built.left_out != 1 else ""
        notes.append(f"{built.left_out} changed file{plural} left out: binary, or skipped by srcly's ignore rules (lockfiles, .json, images).")
    if not built.chunks and not any("no commits" in n.lower() or "empty" in n.lower() or "no base" in n.lower() for n in notes):
        notes.append("Nothing changed in this window.")
    base = window.base
    selection = LensSelection(
        window=params.window,
        mode=params.mode,
        ref=window.branch.default_ref if window.history == "main" and window.branch else params.ref,
        history=window.history,
        branch=LensBranch(**vars(window.branch)) if window.branch else None,
        base=LensEndpoint(ref=base.ref, sha=base.sha, label=base.label, date=iso(base.ts)),
        head=_head_endpoint(built),
        since=iso(window.since),
        until=iso(window.until),
        timezone=local_timezone()[0],
        includes_worktree=built.has_worktree,
        notes=notes,
        repo_root=str(window.repo),
        scope=window.scope,
    )
    chunks = built.chunks
    payload = ChangeLensPayload(
        selection=selection,
        commits=built.commits,
        chunks=chunks,
        files=built.files,
        summary=LensSummary(
            files_edited=len(built.files),
            files_total=files_total,
            chunks=len(chunks),
            churn_lines=sum(c.added + c.deleted for c in chunks),
            net_lines=sum(c.net_added + c.net_deleted for c in chunks),
            reverted=sum(1 for c in chunks if c.status == "reverted"),
        ),
        metric_ids=engine.metric_ids(chunks),
    )
    return payload.wire()


# -- hunk diff -----------------------------------------------------------------


def _near(hunks: list[Hunk]):
    """A filter for diff hunks: keep those that meet one of the chunk's recorded git hunks."""

    def meets(lo: int, hi: int, start: int, count: int) -> bool:
        if hi < lo:
            lo, hi = hi, lo
        other_hi = start + max(count, 1) - 1
        return lo <= other_hi + 1 and start <= hi + 1

    def keep(old_lo: int, old_hi: int, new_lo: int, new_hi: int) -> bool:
        return any(meets(old_lo, old_hi, h.old_start, h.old_lines) or meets(new_lo, new_hi, h.new_start, h.new_lines) for h in hunks)

    return keep


def _change_at(line: Lineage, sha: str):
    return next((c for c in line.changes if c.sha == sha), None)


def hunk_diff(path: Path, params: Params, chunk_id: str, commit: Optional[str] = None) -> dict:
    built, _ = build_lens(path, params)
    draft = built.drafts.get(chunk_id)
    if draft is None:
        raise LensError(f"No chunk {chunk_id} in this selection", status=404)
    store, window, line = built.store, built.window, draft.lineage
    chunk = draft.chunk

    old_ref: Optional[BlobRef] = None
    new_ref: Optional[BlobRef] = None
    old_scope: Optional[Scope] = None
    new_scope: Optional[Scope] = None
    recorded: list[Hunk] = []
    if commit is None:
        old_ref, new_ref = draft.base_file.base, line.head
        old_scope, new_scope = draft.base, draft.head
        recorded = draft.net.hunks
        label_from, label_to = window.base.label, _head_endpoint(built).label
    else:
        if commit != WORKTREE and len(commit) < 7:
            raise LensError("commit needs a sha of 7 characters or more, or WORKTREE")
        if not any(c.sha.startswith(commit) for c in built.commits):
            raise LensError(f"No commit {commit} in this selection", status=404)
        sha = next((s for s in draft.touches if s.startswith(commit)), None)
        if commit == WORKTREE:
            label_from, label_to = window.tip.label, "Working tree"
        else:
            label_from, label_to = f"{commit[:7]}^", commit[:7]
        if sha is not None:
            recorded = draft.touches[sha].hunks
            if draft.is_symbol:
                old_ref, old_scope, new_ref, new_scope = draft.at.get(sha, (None,) * 4)
            else:
                change = _change_at(line, sha)
                if change is not None:
                    old_ref, new_ref = change.old, change.new

    old_lines = split_lines(store.text(old_ref) or "")
    new_lines = split_lines(store.text(new_ref) or "")
    # A chunk's diff holds only the lines it owns: a nested scope's edits belong to that scope's chunk.
    sides = {"old": (store.parsed(old_ref), old_scope), "new": (store.parsed(new_ref), new_scope)}

    def owned(side: str, start: int, count: int) -> list[bool]:
        parsed, scope = sides[side]
        if parsed is None:
            return [True] * count
        at, key = (scope.start - 1, scope.key) if scope else (0, "")
        return [owner == key for owner in parsed.owners(at + start, count)]

    if draft.is_symbol:
        old_at = old_scope.start - 1 if old_scope else 0
        new_at = new_scope.start - 1 if new_scope else 0
        body = textdiff.unified(
            old_lines[old_at : old_scope.end] if old_scope else [],
            new_lines[new_at : new_scope.end] if new_scope else [],
            old_at,
            new_at,
            owned=owned,
        )
    elif draft.kind == "file" and draft.reason == engine.OUTSIDE_SCOPES:
        body = textdiff.unified(old_lines, new_lines, owned=owned) if recorded else []
    else:
        body = textdiff.unified(old_lines, new_lines, keep=_near(recorded)) if recorded else []

    truncated = len(body) > MAX_DIFF_LINES
    text = ""
    if body:
        old_name = f"a/{old_ref.path}" if old_ref and (old_scope or not draft.is_symbol) else "/dev/null"
        new_name = f"b/{new_ref.path}" if new_ref and (new_scope or not draft.is_symbol) else "/dev/null"
        # A CRLF file's lines end in a CR: it is no part of what the reader compares.
        text = "\n".join([f"--- {old_name}", f"+++ {new_name}", *(line.removesuffix("\r") for line in body[:MAX_DIFF_LINES])]) + "\n"
    return LensHunkDiff(
        chunk_id=chunk_id,
        path=chunk.path,
        old_path=chunk.old_path,
        from_=label_from,
        to=label_to,
        diff=text,
        truncated=truncated,
    ).wire()


# -- markdown ------------------------------------------------------------------

_WINDOW_NAMES = {"branch": "This branch", "24h": "Last 24 hours", "7d": "Last 7 days", "custom": "Custom"}
_BUCKET_NAMES = {"complex-and-changed": "Already complex and changed", "new-hotspot": "New hotspot"}


def _number(value) -> str:
    if value is None:
        return "–"
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def _chunk_line(chunk: dict, with_path: bool) -> str:
    name = f"`{chunk['id']}`" if with_path else f"`{chunk['name']}`"
    parts = [f"{name} {chunk['status']}"]
    if chunk["match"] in ("moved", "uncertain", "renamed-file") and chunk.get("oldPath"):
        parts.append(f"from `{chunk['oldPath']}`" + (" (uncertain match)" if chunk["match"] == "uncertain" else ""))
    elif chunk["match"] == "uncertain":
        parts.append("uncertain match")
    complexity = chunk["metrics"].get("complexity")
    if not chunk["measured"]:
        parts.append("not measured")
    elif complexity:
        parts.append(f"complexity {_number(complexity['before'])} → {_number(complexity['after'])}")
    parts.append(f"+{chunk['added']} −{chunk['deleted']}")
    touches = len(chunk["touches"])
    if touches > 1:
        parts.append(f"{touches} touches")
    return "- " + " · ".join(parts)


def render_markdown(payload: dict) -> str:
    sel, summary, chunks = payload["selection"], payload["summary"], payload["chunks"]
    mode = "touched (every chunk a commit changed)" if sel["mode"] == "touched" else "net (base against head)"
    out = [
        f"# Change Lens: {Path(sel['repoRoot']).name}",
        "",
        f"- Window: {_WINDOW_NAMES.get(sel['window'], sel['window'])}, {mode}, first-parent history of `{sel['ref']}`",
        f"- Base: {sel['base']['label']}" + (f" ({sel['base']['date']})" if sel["base"]["date"] else ""),
        f"- Head: {sel['head']['label']}" + (f" ({sel['head']['date']})" if sel["head"]["date"] else ""),
    ]
    if sel["since"] or sel["until"]:
        out.append(f"- Time: {sel['since'] or 'start'} to {sel['until'] or 'now'} ({sel['timezone']})")
    out.append(
        f"- {len(payload['commits'])} commits · {summary['filesEdited']} of {summary['filesTotal']} files edited · "
        f"{summary['chunks']} chunks · {summary['churnLines']} lines churned · {summary['netLines']} net · {summary['reverted']} reverted"
    )
    out.extend(f"- Note: {note}" for note in sel["notes"])

    out.extend(["", "## Review first", ""])
    any_bucket = False
    for bucket, title in _BUCKET_NAMES.items():
        hits = [c for c in chunks if bucket in c["buckets"]]
        if not hits:
            continue
        any_bucket = True
        out.extend([f"### {title}", ""])
        hits.sort(key=lambda c: -((c["metrics"].get("complexity") or {}).get("after") or 0))
        out.extend(_chunk_line(c, with_path=True) for c in hits)
        out.append("")
    if not any_bucket:
        out.extend(["No chunk matches a review bucket.", ""])

    out.extend(["## Edited chunks", ""])
    by_folder: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for chunk in chunks:
        folder = chunk["path"].rsplit("/", 1)[0] if "/" in chunk["path"] else "."
        by_folder[folder][chunk["path"]].append(chunk)
    for folder in sorted(by_folder):
        files = by_folder[folder]
        count = sum(len(v) for v in files.values())
        out.extend([f"### {folder}/ ({count} chunk{'s' if count != 1 else ''} in {len(files)} file{'s' if len(files) != 1 else ''})", ""])
        for file_path in sorted(files):
            out.append(f"- `{file_path.rsplit('/', 1)[-1]}`")
            out.extend("  " + _chunk_line(c, with_path=False) for c in files[file_path])
        out.append("")
    if not chunks:
        out.extend(["No edited chunks.", ""])
    return "\n".join(out)
