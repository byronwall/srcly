"""Line diffs of two texts: zero-context hunks, and unified text with context."""

from __future__ import annotations

from difflib import SequenceMatcher
from typing import Callable, Optional

from app.services.changelens.hunks import Hunk

Op = tuple[str, int, int, int, int]


def opcodes(a: list[str], b: list[str]) -> list[Op]:
    """``SequenceMatcher`` opcodes. The common head and tail are cut first, so a small edit in a big file is cheap."""
    head = 0
    limit = min(len(a), len(b))
    while head < limit and a[head] == b[head]:
        head += 1
    tail = 0
    while tail < limit - head and a[len(a) - 1 - tail] == b[len(b) - 1 - tail]:
        tail += 1
    ops: list[Op] = []
    if head:
        ops.append(("equal", 0, head, 0, head))
    middle = SequenceMatcher(None, a[head : len(a) - tail], b[head : len(b) - tail], autojunk=False)
    for tag, i1, i2, j1, j2 in middle.get_opcodes():
        ops.append((tag, i1 + head, i2 + head, j1 + head, j2 + head))
    if tail:
        ops.append(("equal", len(a) - tail, len(a), len(b) - tail, len(b)))
    return ops


def hunks(a: list[str], b: list[str]) -> list[Hunk]:
    """The changes as git's ``-U0`` would number them."""
    out = []
    for tag, i1, i2, j1, j2 in opcodes(a, b):
        if tag == "equal":
            continue
        old_lines, new_lines = i2 - i1, j2 - j1
        out.append(Hunk(i1 + 1 if old_lines else i1, old_lines, j1 + 1 if new_lines else j1, new_lines))
    return out


def _groups(ops: list[Op], context: int) -> list[list[Op]]:
    """``difflib.SequenceMatcher.get_grouped_opcodes`` for a plain opcode list."""
    ops = list(ops) or [("equal", 0, 1, 0, 1)]
    if ops[0][0] == "equal":
        tag, i1, i2, j1, j2 = ops[0]
        ops[0] = (tag, max(i1, i2 - context), i2, max(j1, j2 - context), j2)
    if ops[-1][0] == "equal":
        tag, i1, i2, j1, j2 = ops[-1]
        ops[-1] = (tag, i1, min(i2, i1 + context), j1, min(j2, j1 + context))
    groups: list[list[Op]] = []
    group: list[Op] = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == "skip":
            # A change that belongs to another chunk: it ends the hunk and is never printed.
            groups.append(group)
            group = []
            continue
        if tag == "equal" and i2 - i1 > 2 * context:
            group.append((tag, i1, min(i2, i1 + context), j1, min(j2, j1 + context)))
            groups.append(group)
            group = []
            i1, j1 = max(i1, i2 - context), max(j1, j2 - context)
        group.append((tag, i1, i2, j1, j2))
    if group and not (len(group) == 1 and group[0][0] == "equal"):
        groups.append(group)
    return [g for g in groups if any(op[0] != "equal" for op in g)]


def _only_owned(ops: list[Op], owned: Callable[[str, int, int], list[bool]]) -> list[Op]:
    """Cut each change into runs of lines the chunk owns and runs it does not (tagged ``skip``)."""
    out: list[Op] = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            out.append((tag, i1, i2, j1, j2))
            continue
        for side, lo, hi in (("old", i1, i2), ("new", j1, j2)):
            flags = owned(side, lo + 1, hi - lo) if hi > lo else []
            start = 0
            for n in range(1, len(flags) + 1):
                if n == len(flags) or flags[n] != flags[start]:
                    a1, a2 = lo + start, lo + n
                    kind = "skip" if not flags[start] else "delete" if side == "old" else "insert"
                    out.append((kind, a1, a2, j1, j1) if side == "old" else (kind, i2, i2, a1, a2))
                    start = n
    return out


def _range(start: int, length: int) -> str:
    if length == 1:
        return str(start + 1)
    return f"{start + 1 if length else start},{length}"


def unified(
    a: list[str],
    b: list[str],
    a_offset: int = 0,
    b_offset: int = 0,
    keep: Optional[Callable[[int, int, int, int], bool]] = None,
    owned: Optional[Callable[[str, int, int], list[bool]]] = None,
    context: int = 3,
) -> list[str]:
    """Unified diff lines (no file header) of two line lists.

    The offsets shift the printed line numbers when ``a`` and ``b`` are slices
    of files. ``keep(old_start, old_end, new_start, new_end)`` filters hunks by
    their 1-based changed line ranges in file coordinates. ``owned(side, start,
    count)`` says, line by line, which changed lines belong to the chunk; the
    rest are left out.
    """
    out: list[str] = []
    ops = opcodes(a, b)
    if owned is not None:
        ops = _only_owned(ops, owned)
    for group in _groups(ops, context):
        if keep is not None:
            wanted = False
            for tag, i1, i2, j1, j2 in group:
                if tag != "equal" and keep(a_offset + i1 + 1, a_offset + i2, b_offset + j1 + 1, b_offset + j2):
                    wanted = True
                    break
            if not wanted:
                continue
        first, last = group[0], group[-1]
        out.append(
            f"@@ -{_range(a_offset + first[1], last[2] - first[1])} +{_range(b_offset + first[3], last[4] - first[3])} @@"
        )
        for tag, i1, i2, j1, j2 in group:
            if tag == "equal":
                out.extend(" " + line for line in a[i1:i2])
                continue
            if tag in ("replace", "delete"):
                out.extend("-" + line for line in a[i1:i2])
            if tag in ("replace", "insert"):
                out.extend("+" + line for line in b[j1:j2])
    return out
