"""Hunks to chunks: follow each file through the window, give every changed line to a scope, pair base with head.

A line belongs to the scope that holds it in the revision the line is in: the
commit's own blob for added lines, its parent's blob for deleted lines. Line
numbers from one revision are never looked up in another.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Optional

from app.services import file_classes, metric_catalog
from app.services.analysis import language_for_path
from app.services.changelens import textdiff
from app.services.changelens.blobs import SYMBOL_LANGUAGES, BlobRef, BlobStore, Parsed, Scope
from app.services.changelens.hunks import FileDiff, Hunk, commit_diffs, kept, split_lines, tree_diff
from app.services.changelens.models import WORKTREE, BeforeAfter, LensChunk, LensCommit, LensFile, LensHunk, LensTouch
from app.services.changelens.window import Window, iso

# Review bucket and matching thresholds, all in one place.
COMPLEX_AT = 10
"""Cyclomatic complexity from which a chunk is a hotspot."""
RANGE_GAP = 10
"""Hunks this many lines apart or closer form one ``range`` chunk."""
MOVED_AT = 0.9
"""Body similarity from which a same-named symbol in another place is ``moved``."""
UNCERTAIN_AT = 0.6
"""Body similarity from which it is still offered, as ``uncertain``."""
BUCKET_CLASSES = frozenset({"code"})
OUT_OF_SCOPE_CLASSES = frozenset({"generated", "vendored"})

OUTSIDE_SCOPES = "Lines outside every named scope"

_ORDINAL = re.compile(r"#\d+(?=\.|$)")


@dataclass
class Tally:
    added: int = 0
    deleted: int = 0
    hunks: list[Hunk] = field(default_factory=list)

    def add(self, other: "Tally") -> None:
        self.added += other.added
        self.deleted += other.deleted
        self.hunks.extend(other.hunks)

    @property
    def lines(self) -> int:
        return self.added + self.deleted


@dataclass
class Change:
    """One commit's (or the working tree's) edit to a file."""

    sha: str
    old: Optional[BlobRef]
    new: Optional[BlobRef]
    hunks: list[Hunk]
    renamed: bool


@dataclass
class Lineage:
    """One file followed through the window, across renames."""

    first_path: str
    path: str
    changes: list[Change] = field(default_factory=list)
    base: Optional[BlobRef] = None
    head: Optional[BlobRef] = None
    net: list[Hunk] = field(default_factory=list)
    file_class: str = "code"
    gave_chunk: bool = False
    broken: str = ""
    """``head`` or ``base`` when the file has a syntax error at that end."""
    """A chunk of this file was paired with one in another file (a move)."""

    @property
    def renamed(self) -> bool:
        return self.base is not None and self.head is not None and self.base.path != self.head.path

    @property
    def shown_path(self) -> str:
        return self.head.path if self.head else self.base.path if self.base else self.path


@dataclass
class Draft:
    """A chunk being built. Kept after the build: the hunk endpoint reads it."""

    lineage: Lineage
    key: str
    kind: str
    name: str
    base: Optional[Scope] = None
    head: Optional[Scope] = None
    seen: Optional[Scope] = None
    """The scope in the last revision that held it, for a symbol absent at both ends."""
    span: tuple[int, int] = (1, 1)
    touches: dict[str, Tally] = field(default_factory=dict)
    net: Tally = field(default_factory=Tally)
    base_lineage: Optional[Lineage] = None
    base_key: str = ""
    match: Optional[str] = None
    measured: bool = True
    reason: Optional[str] = None
    at: dict[str, tuple[Optional[BlobRef], Optional[Scope], Optional[BlobRef], Optional[Scope]]] = field(default_factory=dict)
    """Per commit that touched a symbol: the old blob and scope, the new blob and scope."""
    chunk: Optional[LensChunk] = None

    @property
    def is_symbol(self) -> bool:
        return self.kind in ("function", "class", "heading")

    @property
    def base_file(self) -> Lineage:
        return self.base_lineage or self.lineage


@dataclass
class Built:
    window: Window
    mode: str
    store: BlobStore
    commits: list[LensCommit]
    chunks: list[LensChunk]
    files: list[LensFile]
    drafts: dict[str, Draft]
    has_worktree: bool
    left_out: int
    """Changed files not read: binary, or skipped by srcly's ignore rules."""
    notes: list[str] = field(default_factory=list)


# -- lineages -----------------------------------------------------------------


def _follow(window: Window, steps: list[tuple[str, list[FileDiff]]]) -> list[Lineage]:
    current: dict[str, Lineage] = {}
    lineages: list[Lineage] = []
    for sha, diffs in steps:
        on_disk = sha == WORKTREE
        after = dict(current)
        for diff in diffs:
            old = BlobRef(diff.old_path, sha=diff.old_sha) if diff.old_path and diff.old_sha else None
            new: Optional[BlobRef] = None
            if diff.new_path:
                if on_disk:
                    new = BlobRef(diff.new_path, disk=str(window.repo / diff.new_path))
                elif diff.new_sha:
                    new = BlobRef(diff.new_path, sha=diff.new_sha)
            source = diff.old_path or diff.new_path or ""
            line = current.get(source)
            if line is None:
                line = Lineage(first_path=source, path=source)
                lineages.append(line)
            line.changes.append(Change(sha, old, new, diff.hunks, renamed=diff.status == "R"))
            if diff.status == "R" and diff.new_path:
                if after.get(source) is line:
                    del after[source]
                line.path = diff.new_path
            after[line.path] = line
        current = after
    return lineages


def _resolve_ends(window: Window, store: BlobStore, lineages: list[Lineage], net: list[FileDiff], dirty: set[str], has_worktree: bool) -> None:
    """Read each file's base and head from the two snapshots, and its net hunks."""
    repo = window.repo
    at_base = store.lookup(window.base_tree, [line.first_path for line in lineages])
    at_tip = store.lookup(window.tip.sha, [line.path for line in lineages if line.path not in dirty])
    for line in lineages:
        # A file that a commit of the window added has no base, and one it deleted has no head,
        # though another file can hold the same path at that end (a rename away, then a new file).
        if line.changes[0].old is not None:
            line.base = at_base.get(line.first_path)
        if line.changes[-1].new is None:
            line.head = None
        elif has_worktree and line.path in dirty:
            full = repo / line.path
            line.head = BlobRef(line.path, disk=str(full)) if full.is_file() else None
        else:
            line.head = at_tip.get(line.path)

    known_base = {line.base.path for line in lineages if line.base}
    known_head = {line.head.path for line in lineages if line.head}
    by_new = {d.new_path: d for d in net if d.new_path}
    by_old = {d.old_path: d for d in net if d.old_path and not d.new_path}
    for line in lineages:
        base, head = line.base, line.head
        diff = by_new.get(head.path) if head else by_old.get(base.path) if base else None
        if diff is not None and diff.old_path == (base.path if base else None) and diff.new_path == (head.path if head else None):
            line.net = diff.hunks
        elif (base is None and head is None) or (base and head and base.sha and base.sha == head.sha):
            line.net = []
        else:
            # Git paired the two snapshots another way (a rename it did not follow).
            line.net = textdiff.hunks(_lines(store, base), _lines(store, head))

    # Files that differ between the snapshots though no commit in the window touched them.
    for diff in net:
        if (diff.new_path and diff.new_path in known_head) or (diff.old_path and diff.old_path in known_base):
            continue
        line = Lineage(first_path=diff.old_path or diff.new_path or "", path=diff.new_path or diff.old_path or "")
        if diff.old_path and diff.old_sha:
            line.base = BlobRef(diff.old_path, sha=diff.old_sha)
        if diff.new_path:
            if diff.new_sha:
                line.head = BlobRef(diff.new_path, sha=diff.new_sha)
            elif has_worktree:
                line.head = BlobRef(diff.new_path, disk=str(repo / diff.new_path))
        line.net = diff.hunks
        lineages.append(line)


def _lines(store: BlobStore, ref: Optional[BlobRef]) -> list[str]:
    return split_lines(store.text(ref) or "")


# -- attribution ---------------------------------------------------------------


Names = dict[str, str]
"""A blob's scope keys to the keys the file's chunks have. Empty when the two are the same."""


def _attribute(
    old: Optional[Parsed], new: Optional[Parsed], hunks: list[Hunk], old_names: Names = {}, new_names: Names = {}
) -> dict[str, Tally]:
    out: dict[str, Tally] = defaultdict(Tally)
    for hunk in hunks:
        new_keys = [new_names.get(k, k) for k in new.owners(hunk.new_start, hunk.new_lines)] if new else [""] * hunk.new_lines
        old_keys = [old_names.get(k, k) for k in old.owners(hunk.old_start, hunk.old_lines)] if old else [""] * hunk.old_lines
        for key in new_keys:
            out[key].added += 1
        for key in old_keys:
            out[key].deleted += 1
        for key in dict.fromkeys(new_keys + old_keys):
            out[key].hunks.append(hunk)
    return out


def _whole(hunks: list[Hunk]) -> Tally:
    return Tally(sum(h.new_lines for h in hunks), sum(h.old_lines for h in hunks), list(hunks))


def _align(a: Parsed, b: Parsed) -> Names:
    """Each scope key of ``a`` to the key of its scope in ``b``.

    Scopes pair by qualified name. When a name is held more than once (overloads,
    a getter and its setter), identical bodies pair first, then the closest
    bodies: position in the file never decides.
    """
    theirs: dict[str, list[Scope]] = defaultdict(list)
    for scope in b.scopes.values():
        theirs[scope.group].append(scope)
    mine: dict[str, list[Scope]] = defaultdict(list)
    for scope in a.scopes.values():
        mine[scope.group].append(scope)
    out: Names = {}
    for group, left in mine.items():
        right = list(theirs.get(group, []))
        if len(left) == 1 and len(right) == 1:
            out[left[0].key] = right[0].key
            continue
        rest = []
        for scope in left:
            same = next((other for other in right if other.body == scope.body), None)
            if same is None:
                rest.append(scope)
            else:
                out[scope.key] = same.key
                right.remove(same)
        ranked = sorted(
            ((-SequenceMatcher(None, s.body, o.body, autojunk=False).ratio(), i, j) for i, s in enumerate(rest) for j, o in enumerate(right)),
        )
        used: set[int] = set()
        for _, i, j in ranked:
            if rest[i].key not in out and j not in used:
                out[rest[i].key] = right[j].key
                used.add(j)
    return out


def _chunk_names(base: Optional[Parsed], head: Optional[Parsed], others: list[Parsed]) -> dict[int, Names]:
    """For each parsed blob of one file (by ``id``): its scope keys as chunk keys.

    A chunk has its key at head. A scope that is not at head has its key at
    base; one that is at neither end has its own key. A key already taken gets a new ordinal.
    """
    if not any(p.dupes for p in (base, head, *others) if p):
        return {}
    taken = set(head.scopes) if head else set()
    spare: dict[tuple[bool, str], str] = {}

    def fresh(key: str, at_base: bool = False) -> str:
        slot = (at_base, key)
        if slot not in spare:
            name, n = _ORDINAL.sub("", key), 2
            spare[slot] = name
            while spare[slot] in taken:
                spare[slot] = f"{name}#{n}"
                n += 1
            taken.add(spare[slot])
        return spare[slot]

    out: dict[int, Names] = {}
    if head:
        out[id(head)] = {key: key for key in head.scopes}
    base_names: Names = {}
    if base and id(base) not in out:
        to_head = _align(base, head) if head else {}
        base_names = out[id(base)] = {key: to_head.get(key) or fresh(key, at_base=True) for key in base.scopes}
    for parsed in others:
        if id(parsed) in out:
            continue
        to_head = _align(parsed, head) if head else {}
        to_base = _align(parsed, base) if base else {}
        out[id(parsed)] = {
            key: to_head.get(key) or (base_names[to_base[key]] if key in to_base and base_names else None) or fresh(key)
            for key in parsed.scopes
        }
    return out


def _scope_at(parsed: Optional[Parsed], names: Names, key: str) -> Optional[Scope]:
    if parsed is None:
        return None
    if not names:
        return parsed.scopes.get(key)
    return next((scope for raw, scope in parsed.scopes.items() if names[raw] == key), None)


def _symbol_drafts(store: BlobStore, line: Lineage) -> list[Draft]:
    base, head = store.parsed(line.base), store.parsed(line.head)
    sides = [(change, store.parsed(change.old), store.parsed(change.new)) for change in line.changes]
    names = _chunk_names(base, head, [p for _, old, new in sides for p in (old, new) if p])
    touches: dict[str, dict[str, Tally]] = defaultdict(dict)
    at: dict[str, dict] = defaultdict(dict)
    seen: dict[str, Scope] = {}
    for change, old, new in sides:
        old_names, new_names = names.get(id(old), {}), names.get(id(new), {})
        for key, tally in _attribute(old, new, change.hunks, old_names, new_names).items():
            touches[key][change.sha] = tally
            old_scope, new_scope = _scope_at(old, old_names, key), _scope_at(new, new_names, key)
            at[key][change.sha] = (change.old, old_scope, change.new, new_scope)
            if new_scope or old_scope:
                seen[key] = new_scope or old_scope
    base_names = names.get(id(base), {})
    net = _attribute(base, head, line.net, base_names)

    drafts = []
    for key in dict.fromkeys([*touches, *net]):
        base_scope = _scope_at(base, base_names, key)
        head_scope = head.scopes.get(key) if head else None
        scope = head_scope or base_scope or seen.get(key)
        if key and scope is None:
            continue
        draft = Draft(line, key, scope.kind if scope else "file", key or line.shown_path.rsplit("/", 1)[-1])
        draft.base, draft.head, draft.seen = base_scope, head_scope, scope
        draft.touches, draft.net, draft.at = touches.get(key, {}), net.get(key, Tally()), at.get(key, {})
        if not key:
            draft.measured, draft.reason = False, OUTSIDE_SCOPES
            parsed = head or base
            if parsed and parsed.reason:
                draft.reason = parsed.reason
        elif scope.kind == "heading":
            draft.measured, draft.reason = False, "Markdown sections have no code metrics"
        drafts.append(draft)
    return drafts


def _shift(line: int, hunks: list[Hunk]) -> int:
    """Where ``line`` of the old side is on the new side of one change."""
    delta = 0
    for hunk in hunks:
        if hunk.old_lines == 0:
            if line <= hunk.old_start:
                break
            delta += hunk.new_lines
        elif line >= hunk.old_start + hunk.old_lines:
            delta += hunk.new_lines - hunk.old_lines
        elif line >= hunk.old_start:
            return max(1, hunk.new_start + min(line - hunk.old_start, max(hunk.new_lines - 1, 0)))
        else:
            break
    return line + delta


def _range_drafts(store: BlobStore, line: Lineage, mode: str, reason: str) -> list[Draft]:
    """A file with no named scopes: nearby hunks, placed in head line numbers, form one chunk."""
    total = max(1, len(_lines(store, line.head)))
    items: list[tuple[int, int, Optional[str], Hunk]] = []

    def place(hunk: Hunk, later: list[Change], sha: Optional[str]) -> None:
        lo = max(1, hunk.new_start)
        hi = lo + max(hunk.new_lines, 1) - 1
        for change in later:
            lo, hi = _shift(lo, change.hunks), _shift(hi, change.hunks)
        lo = min(max(1, lo), total)
        items.append((lo, min(max(lo, hi), total), sha, hunk))

    if mode == "touched":
        for i, change in enumerate(line.changes):
            for hunk in change.hunks:
                place(hunk, line.changes[i + 1 :], change.sha)
    for hunk in line.net:
        place(hunk, [], None)

    drafts: list[Draft] = []
    for lo, hi, sha, hunk in sorted(items, key=lambda item: (item[0], item[1])):
        draft = drafts[-1] if drafts and lo <= drafts[-1].span[1] + RANGE_GAP else None
        if draft is None:
            draft = Draft(line, "", "range", "", measured=False, reason=reason)
            draft.span = (lo, hi)
            drafts.append(draft)
        draft.span = (draft.span[0], max(draft.span[1], hi))
        tally = draft.net if sha is None else draft.touches.setdefault(sha, Tally())
        tally.add(_whole([hunk]))
    for draft in drafts:
        lo, hi = draft.span
        draft.key = f"L{lo}-{hi}"
        draft.name = f"lines {lo}–{hi}" if hi > lo else f"line {lo}"
    return drafts


def _file_draft(line: Lineage, reason: str) -> Draft:
    """The whole file as one chunk."""
    draft = Draft(line, "", "file", line.shown_path.rsplit("/", 1)[-1], measured=False, reason=reason)
    for change in line.changes:
        if change.hunks or change.renamed:
            draft.touches.setdefault(change.sha, Tally()).add(_whole(change.hunks))
    draft.net = _whole(line.net)
    return draft


def _drafts_for(store: BlobStore, line: Lineage, mode: str) -> list[Draft]:
    line.file_class, class_reason = file_classes.classify(line.shown_path)
    if line.file_class in OUT_OF_SCOPE_CLASSES:
        return [_file_draft(line, f"Not analyzed: {line.file_class} file ({class_reason})")]
    if store.text(line.head) is None and store.text(line.base) is None and (line.head or line.base):
        return [_file_draft(line, "Not analyzed: binary content")]
    if language_for_path(line.shown_path) in SYMBOL_LANGUAGES:
        head, base = store.parsed(line.head), store.parsed(line.base)
        line.broken = "head" if head and head.broken else "base" if base and base.broken else ""
        if line.broken:
            # The scopes of a file that does not parse are guesses: one honest chunk, no symbols.
            if line.base is None or line.head is None:
                return [_file_draft(line, f"Syntax error at {line.broken}: scopes are not read")]
            return _range_drafts(store, line, mode, f"Syntax error at {line.broken}: scopes are not read")
        return _symbol_drafts(store, line)
    parsed = store.parsed(line.head) or store.parsed(line.base)
    reason = (parsed.reason if parsed else None) or "No analyzer reads this file type"
    if line.base is None or line.head is None:
        return [_file_draft(line, reason)]
    return _range_drafts(store, line, mode, reason)


# -- pairing -------------------------------------------------------------------


def _leaf(draft: Draft) -> str:
    """The name a moved symbol keeps: the last part of a qualified name, the whole of a heading."""
    return _ORDINAL.sub("", draft.key if draft.kind == "heading" else draft.key.rsplit(".", 1)[-1])


def _similar(a: tuple[str, ...], b: tuple[str, ...]) -> float:
    if a == b:
        return 1.0
    matcher = SequenceMatcher(None, a, b, autojunk=False)
    if matcher.real_quick_ratio() < UNCERTAIN_AT or matcher.quick_ratio() < UNCERTAIN_AT:
        return 0.0
    return matcher.ratio()


def _pair_moves(drafts: list[Draft]) -> list[Draft]:
    """Pair a symbol that left one place with the same body arriving in another.

    Same name and a near-identical body is ``moved``. A looser body match, or a
    new name on an unchanged body in the same file, is ``uncertain``.
    """
    gone = [d for d in drafts if d.is_symbol and d.base and not d.head]
    new = [d for d in drafts if d.is_symbol and d.head and not d.base]
    if not gone or not new:
        return drafts
    by_leaf: dict[str, list[Draft]] = defaultdict(list)
    by_file: dict[int, list[Draft]] = defaultdict(list)
    for draft in gone:
        by_leaf[_leaf(draft)].append(draft)
        by_file[id(draft.lineage)].append(draft)
    taken: set[int] = set()
    for arrival in new:
        body = arrival.head.body
        best: Optional[tuple[float, Draft, str]] = None
        if len(body) >= 2:
            for source in by_leaf[_leaf(arrival)]:
                if id(source) in taken or source.kind != arrival.kind:
                    continue
                ratio = _similar(source.base.body, body)
                if ratio >= UNCERTAIN_AT and (best is None or ratio > best[0]):
                    best = (ratio, source, "moved" if ratio >= MOVED_AT else "uncertain")
        if best is None and len(body) >= (2 if arrival.kind == "heading" else 4):
            # A renamed symbol or heading: compare the bodies without their first lines, which hold the names.
            for source in by_file[id(arrival.lineage)]:
                if id(source) in taken or source.kind != arrival.kind:
                    continue
                ratio = _similar(source.base.body[1:], body[1:])
                if ratio >= MOVED_AT and (best is None or ratio > best[0]):
                    best = (ratio, source, "uncertain")
        if best is None:
            continue
        _, source, match = best
        taken.add(id(source))
        arrival.base, arrival.base_lineage, arrival.base_key, arrival.match = source.base, source.lineage, source.key, match
        for sha, tally in source.touches.items():
            arrival.touches.setdefault(sha, Tally()).add(tally)
            # The commit's two sides: the arrival's own, and the source's where the arrival has none.
            mine, theirs = arrival.at.get(sha, (None,) * 4), source.at.get(sha, (None,) * 4)
            arrival.at[sha] = (*(mine[:2] if mine[1] else theirs[:2]), *(mine[2:] if mine[3] else theirs[2:]))
        arrival.net.hunks.extend(source.net.hunks)
        if source.lineage is not arrival.lineage:
            source.lineage.gave_chunk = True
    return [d for d in drafts if id(d) not in taken]


# -- finishing -----------------------------------------------------------------


def _slice(store: BlobStore, ref: Optional[BlobRef], scope: Optional[Scope]) -> list[str]:
    if ref is None or scope is None:
        return []
    return _lines(store, ref)[scope.start - 1 : scope.end]


def _metrics(before: Optional[dict], after: Optional[dict]) -> dict[str, BeforeAfter]:
    out = {}
    for name in dict.fromkeys([*(before or {}), *(after or {})]):
        pair = BeforeAfter(before=(before or {}).get(name), after=(after or {}).get(name))
        if pair.before is not None or pair.after is not None:
            out[name] = pair
    return out


def _buckets(chunk: LensChunk) -> list[str]:
    complexity = chunk.metrics.get("complexity")
    if chunk.kind != "function" or chunk.file_class not in BUCKET_CLASSES or complexity is None:
        return []
    before, after = complexity.before, complexity.after
    out = []
    changed = chunk.net_added + chunk.net_deleted > 0
    if before is not None and after is not None and before >= COMPLEX_AT and changed:
        out.append("complex-and-changed")
    if after is not None and after >= COMPLEX_AT and (chunk.status == "added" or (before is not None and after > before)):
        out.append("new-hotspot")
    return out


def _finish(store: BlobStore, draft: Draft, mode: str, order: dict[str, int], times: dict[str, Optional[int]]) -> LensChunk:
    line = draft.lineage
    base_file = draft.base_file
    path = line.shown_path
    if draft.is_symbol:
        has_base, has_head = draft.base is not None, draft.head is not None
    else:
        has_base, has_head = line.base is not None, line.head is not None

    net = draft.net
    metrics: dict[str, BeforeAfter] = {}
    if draft.is_symbol and has_base and has_head:
        old, new = _slice(store, base_file.base, draft.base), _slice(store, line.head, draft.head)
        if draft.base_lineage is not None or (net.lines and old == new):
            # A move: the lines that differ are the body's own, not the whole relocated block.
            body = textdiff.hunks(old, new)
            net = Tally(sum(h.new_lines for h in body), sum(h.old_lines for h in body), net.hunks)
    if draft.kind in ("function", "class"):
        metrics = _metrics(draft.base.metrics if draft.base else None, draft.head.metrics if draft.head else None)
    elif draft.kind == "file" and draft.measured:
        base, head = store.parsed(line.base), store.parsed(line.head)
        metrics = _metrics(base.file_metrics if base else None, head.file_metrics if head else None)

    touches = sorted(draft.touches.items(), key=lambda item: order.get(item[0], 0))
    churn = sum(t.lines for _, t in touches)
    crossed = base_file.shown_path != path if draft.base_lineage else line.renamed
    reason = draft.reason
    if has_base and has_head:
        match = draft.match or ("renamed-file" if line.renamed else "exact")
        if draft.base_lineage is not None:
            status = "moved" if match == "moved" or crossed else "modified"
        elif net.lines == 0:
            # Touched and back where it started, or carried along unchanged (a rename, a move in its file).
            status = "reverted" if draft.net.lines == 0 and churn else "moved"
        else:
            status = "moved" if line.renamed else "modified"
    elif has_head:
        match, status = "none", "added"
    elif has_base:
        match, status = "none", "deleted"
    else:
        match, status = "none", "reverted"
        if draft.is_symbol:
            reason = "Added and removed inside the window: nothing to measure at base or head"

    scope = draft.head or draft.base or draft.seen
    if draft.kind == "range":
        start, end = draft.span
    elif scope is not None:
        start, end = scope.start, scope.end
    else:
        start, end = 1, max(1, len(_lines(store, line.head or line.base)))
    base_span: tuple[Optional[int], Optional[int]] = (None, None)
    if draft.base is not None:
        base_span = (draft.base.start, draft.base.end)
    elif draft.kind == "file" and line.base is not None:
        base_span = (1, max(1, len(_lines(store, line.base))))

    old_path = base_file.base.path if has_base and base_file.base and base_file.base.path != path else None
    stamps = [times.get(sha) for sha, _ in touches]
    stamps = [t for t in stamps if t is not None]
    if mode == "net":
        hunks = [LensHunk(sha=None, old_start=h.old_start, old_lines=h.old_lines, new_start=h.new_start, new_lines=h.new_lines) for h in draft.net.hunks]
    else:
        hunks = [
            LensHunk(sha=sha, old_start=h.old_start, old_lines=h.old_lines, new_start=h.new_start, new_lines=h.new_lines)
            for sha, tally in touches
            for h in tally.hunks
        ]
    chunk = LensChunk(
        id=f"{path}::{draft.key}" if draft.key else path,
        path=path,
        old_path=old_path,
        kind=draft.kind,
        name=draft.name,
        start_line=start,
        end_line=end,
        base_start_line=base_span[0],
        base_end_line=base_span[1],
        status=status,
        match=match,
        added=net.added if mode == "net" else sum(t.added for _, t in touches),
        deleted=net.deleted if mode == "net" else sum(t.deleted for _, t in touches),
        net_added=net.added,
        net_deleted=net.deleted,
        touches=[] if mode == "net" else [LensTouch(sha=sha, added=t.added, deleted=t.deleted) for sha, t in touches],
        first_touched=iso(stamps[0]) if stamps else None,
        last_touched=iso(stamps[-1]) if stamps else None,
        metrics=metrics,
        measured=draft.measured and not (status == "reverted" and not has_base),
        na_reason=reason,
        buckets=[],
        file_class=line.file_class,
        hunks=hunks,
    )
    chunk.buckets = _buckets(chunk)
    return chunk


# -- build ---------------------------------------------------------------------


def build(window: Window, mode: str) -> Built:
    repo, scope = window.repo, window.scope
    store = BlobStore(repo)
    left_out: set[str] = set()

    def keep(diffs: list[FileDiff]) -> list[FileDiff]:
        keeping = kept(diffs)
        ids = {id(d) for d in keeping}
        left_out.update(d.path for d in diffs if id(d) not in ids and d.path)
        return keeping

    read = [c for c in window.commits if not c.upstream_merge]
    per_commit = commit_diffs(repo, [c.sha for c in read], scope)
    steps = [(c.sha, keep(per_commit.get(c.sha, []))) for c in read]
    dirty: set[str] = set()
    has_worktree = False
    if window.wants_worktree:
        diffs = keep(tree_diff(repo, window.tip.sha, None, scope))
        if diffs:
            has_worktree = True
            steps.append((WORKTREE, diffs))
            dirty = {p for d in diffs for p in (d.old_path, d.new_path) if p}
    net: list[FileDiff] = []
    if has_worktree or window.base_tree != window.tip.sha:
        net = keep(tree_diff(repo, window.base_tree, None if has_worktree else window.tip.sha, scope))

    lineages = _follow(window, steps)
    _resolve_ends(window, store, lineages, net, dirty, has_worktree)
    store.load(
        [ref for line in lineages for change in line.changes for ref in (change.old, change.new) if ref]
        + [ref for line in lineages for ref in (line.base, line.head) if ref]
    )

    store.warm(
        ref
        for line in lineages
        if language_for_path(line.path) in SYMBOL_LANGUAGES and file_classes.classify(line.path)[0] not in OUT_OF_SCOPE_CLASSES
        for ref in (line.base, line.head, *(side for change in line.changes for side in (change.old, change.new)))
        if ref
    )
    drafts: list[Draft] = []
    for line in lineages:
        drafts.extend(_drafts_for(store, line, mode))
    drafts = _pair_moves(drafts)

    order = {sha: i for i, (sha, _) in enumerate(steps)}
    times: dict[str, Optional[int]] = {c.sha: c.ts for c in window.commits}
    finished: list[Draft] = []
    for draft in drafts:
        if mode == "touched" and not draft.touches:
            continue
        draft.chunk = _finish(store, draft, mode, order, times)
        if mode == "net" and draft.chunk.status == "reverted":
            continue
        finished.append(draft)

    # A renamed file with no edited chunk still shows, as one unchanged chunk.
    with_chunks = {id(d.lineage) for d in finished}
    for line in lineages:
        if not line.renamed or id(line) in with_chunks:
            continue
        if mode == "touched" and not line.changes:
            continue
        draft = _file_draft(line, "")
        draft.net = Tally()
        parsed = store.parsed(line.head)
        draft.measured = bool(parsed and not parsed.reason and parsed.language != "markdown" and line.file_class not in OUT_OF_SCOPE_CLASSES)
        draft.reason = None if draft.measured else (parsed.reason if parsed and parsed.reason else "No code metrics for this file")
        draft.touches = {c.sha: Tally() for c in line.changes if c.renamed}
        draft.chunk = _finish(store, draft, mode, order, times)
        finished.append(draft)

    finished.sort(key=lambda d: (d.chunk.path, d.chunk.start_line, d.chunk.id))
    by_id: dict[str, Draft] = {}
    for draft in finished:
        # Two scopes can share an id only through odd names; keep ids unique.
        chunk_id, n = draft.chunk.id, 2
        while chunk_id in by_id:
            chunk_id = f"{draft.chunk.id}~{n}"
            n += 1
        draft.chunk.id = chunk_id
        by_id[chunk_id] = draft

    files = _files(store, lineages, finished, mode)
    commits = _commits(window, steps, finished, has_worktree)
    notes = []
    for end in ("head", "base"):
        broken = sorted({d.lineage.shown_path for d in finished if d.lineage.broken == end})
        if broken:
            names = ", ".join(broken[:3]) + (f" and {len(broken) - 3} more" if len(broken) > 3 else "")
            verb = "has" if len(broken) == 1 else "have"
            notes.append(f"{names} {verb} a syntax error at {end}: the changed lines are shown with no symbols and no metrics.")
    return Built(window, mode, store, commits, [d.chunk for d in finished], files, by_id, has_worktree, len(left_out), notes)


def _files(store: BlobStore, lineages: list[Lineage], drafts: list[Draft], mode: str) -> list[LensFile]:
    chunk_ids: dict[int, list[str]] = defaultdict(list)
    for draft in drafts:
        chunk_ids[id(draft.lineage)].append(draft.chunk.id)
    files: list[LensFile] = []
    by_path: dict[str, LensFile] = {}
    # A file at head comes first: a deleted file whose path a renamed file took joins that file's entry.
    for line in sorted(lineages, key=lambda line: line.head is None):
        ids = chunk_ids.get(id(line), [])
        if not ids and not line.gave_chunk:
            continue
        shared = by_path.get(line.shown_path)
        if shared is not None:
            shared.chunk_ids.extend(ids)
            if mode == "net":
                shared.added += sum(h.new_lines for h in line.net)
                shared.deleted += sum(h.old_lines for h in line.net)
            else:
                shared.added += sum(h.new_lines for c in line.changes for h in c.hunks)
                shared.deleted += sum(h.old_lines for c in line.changes for h in c.hunks)
            continue
        if line.base is None and line.head is None:
            status = "deleted"
        elif line.base is None:
            status = "added"
        elif line.head is None:
            status = "deleted"
        else:
            status = "renamed" if line.renamed else "modified"
        if mode == "net":
            added, deleted = sum(h.new_lines for h in line.net), sum(h.old_lines for h in line.net)
        else:
            added = sum(h.new_lines for c in line.changes for h in c.hunks)
            deleted = sum(h.old_lines for c in line.changes for h in c.hunks)
        loc: Optional[int] = None
        if line.head is not None:
            if line.file_class in OUT_OF_SCOPE_CLASSES:
                loc = sum(1 for text in _lines(store, line.head) if text.strip())
            else:
                parsed = store.parsed(line.head)
                loc = parsed.loc if parsed else 0
        files.append(
            by_path.setdefault(line.shown_path, LensFile(
                path=line.shown_path,
                old_path=line.base.path if line.renamed else None,
                status=status,
                added=added,
                deleted=deleted,
                loc=loc,
                file_class=line.file_class,
                chunk_ids=ids,
                out_of_scope=line.file_class in OUT_OF_SCOPE_CLASSES,
            ))
        )
    files.sort(key=lambda f: f.path)
    return files


def _commits(window: Window, steps: list[tuple[str, list[FileDiff]]], drafts: list[Draft], has_worktree: bool) -> list[LensCommit]:
    touched: dict[str, list[str]] = defaultdict(list)
    for draft in drafts:
        for sha in draft.touches:
            touched[sha].append(draft.chunk.id)
    diffs = dict(steps)
    out = []
    for commit in window.commits:
        own = diffs.get(commit.sha, [])
        out.append(
            LensCommit(
                sha=commit.sha,
                short=commit.short,
                subject=commit.subject,
                author=commit.author,
                date=iso(commit.ts),
                files=len(own),
                added=sum(d.added for d in own),
                deleted=sum(d.deleted for d in own),
                chunk_ids=touched.get(commit.sha, []),
            )
        )
    if has_worktree:
        own = diffs.get(WORKTREE, [])
        out.append(
            LensCommit(
                sha=WORKTREE,
                short="worktree",
                subject="Uncommitted changes",
                author="",
                date=None,
                files=len(own),
                added=sum(d.added for d in own),
                deleted=sum(d.deleted for d in own),
                chunk_ids=touched.get(WORKTREE, []),
            )
        )
    return out


def metric_ids(chunks: list[LensChunk]) -> list[str]:
    """Metrics with a before/after on at least one chunk, in catalog order."""
    used = {name for chunk in chunks for name in chunk.metrics}
    ordered = [spec.id for spec in metric_catalog.METRICS if spec.id in used]
    return ordered + sorted(used - set(ordered))
