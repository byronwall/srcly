"""Comment noise: over-commenting flagged on absolute thresholds.

Three kinds of flag, each with a source span so the code viewer can mark it:

- ``ratio``: a function (or, when no function is flagged, the file) with
  more than ``RATIO_LIMIT`` comment lines per code line, and at least
  ``RATIO_MIN_CODE_LINES`` code lines so tiny helpers don't trip it. More
  comment lines than code lines is narration. (The M7 pilot started at 0.5:
  on four repos nearly every flag between 0.5 and 1.0 was a docstring stating
  a contract the code can't show. See docs/research/metric-pilot-2026-10.)
- ``docblock``: a function's docblock or docstring that is at least
  ``DOCBLOCK_MIN_LINES`` long and more than ``DOCBLOCK_BODY_FACTOR`` times its
  body's code lines.
- ``commented_code``: a run of at least ``COMMENTED_CODE_MIN_RUN`` line
  comments that parses as code.

The thresholds are absolute on purpose. A repo-relative norm would call a
heavily over-commented repo normal.

The analyzers supply the language parts (comment spans, function spans,
docstrings, a "does this parse as code" check); this module does the rest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable

RATIO_LIMIT = 1.0
RATIO_MIN_CODE_LINES = 10
DOCBLOCK_BODY_FACTOR = 1.5
DOCBLOCK_MIN_LINES = 8
COMMENTED_CODE_MIN_RUN = 3

FLAG_KINDS = ("ratio", "docblock", "commented_code")
# Metrics field per flag kind.
FLAG_METRIC = {
    "ratio": "comment_noise_ratio",
    "docblock": "comment_noise_docblock",
    "commented_code": "comment_noise_commented_code",
}

# Prose lines dropped from either end of a run when looking for code in it,
# and the longest run checked at all.
_MAX_TRIM = 2
_MAX_RUN = 60

# Comment runs that are tool directives, not prose or code.
_DIRECTIVE_MARKERS = ("eslint", "@ts-", "prettier-ignore", "noqa", "pragma", "type: ignore", "istanbul", "biome-ignore")


@dataclass(frozen=True)
class CommentSpan:
    """One comment (or docstring), 1-based inclusive lines."""

    start_line: int
    end_line: int
    # Column where the comment starts on its first line.
    start_col: int
    # Text with the comment marker stripped, for line comments only.
    line_text: str | None = None


@dataclass
class ScopeSpan:
    """An executable function: its lines and, if any, its docblock lines."""

    start_line: int
    end_line: int
    target: object  # FunctionMetrics the flags count toward
    doc_start: int = 0
    doc_end: int = 0


@dataclass(frozen=True)
class NoiseFlag:
    kind: str
    line: int
    end_line: int
    note: str


@dataclass
class NoiseResult:
    file_flags: list[NoiseFlag] = field(default_factory=list)
    scope_flags: dict[int, list[NoiseFlag]] = field(default_factory=dict)  # id(target) -> flags


class LineKinds:
    """Classifies each line as blank, comment-only, or code."""

    def __init__(self, lines: list[str], comments: Iterable[CommentSpan]) -> None:
        self.lines = lines
        self.comment_only: set[int] = set()
        for c in comments:
            first = lines[c.start_line - 1] if 0 < c.start_line <= len(lines) else ""
            if not first[: c.start_col].strip():
                self.comment_only.add(c.start_line)
            # Continuation lines of a block comment start inside it.
            self.comment_only.update(range(c.start_line + 1, c.end_line + 1))

    def is_blank(self, line: int) -> bool:
        return not self.lines[line - 1].strip() if 0 < line <= len(self.lines) else True

    def counts(self, start: int, end: int, skip: set[int] | None = None) -> tuple[int, int]:
        """(comment-only lines, code lines) in ``start..end``, less ``skip``."""
        comments = code = 0
        for line in range(max(start, 1), min(end, len(self.lines)) + 1):
            if self.is_blank(line) or (skip and line in skip):
                continue
            if line in self.comment_only:
                comments += 1
            else:
                code += 1
        return comments, code


def leading_comment_block(kinds: LineKinds, start_line: int) -> tuple[int, int]:
    """Comment-only lines directly above ``start_line`` (no blank gap), or (0, 0)."""
    line = start_line - 1
    end = line
    while line >= 1 and line in kinds.comment_only:
        line -= 1
    return (line + 1, end) if line < end else (0, 0)


def analyze(
    lines: list[str],
    comments: list[CommentSpan],
    scopes: list[ScopeSpan],
    looks_like_code: Callable[[str], bool],
) -> NoiseResult:
    kinds = LineKinds(lines, comments)
    result = NoiseResult()

    def add(scope: ScopeSpan | None, flag: NoiseFlag) -> None:
        result.file_flags.append(flag)
        if scope is not None:
            result.scope_flags.setdefault(id(scope.target), []).append(flag)

    # Ratio and docblock, per function. A docblock above the function (JSDoc)
    # counts toward its comments; a docstring is already inside it. Inner
    # functions go first, and a flagged one's lines leave its parents' counts,
    # so one narrated helper isn't flagged again on every enclosing function.
    flagged_lines: set[int] = set()
    for scope in sorted(scopes, key=lambda s: s.end_line - s.start_line):
        comment_lines, code_lines = kinds.counts(scope.start_line, scope.end_line, flagged_lines)
        doc_lines = 0
        if scope.doc_start:
            doc_lines = scope.doc_end - scope.doc_start + 1
            if scope.doc_end < scope.start_line:
                comment_lines += doc_lines
        if code_lines >= RATIO_MIN_CODE_LINES and comment_lines / code_lines > RATIO_LIMIT:
            add(scope, NoiseFlag(
                "ratio",
                min(scope.start_line, scope.doc_start or scope.start_line),
                scope.end_line,
                f"{comment_lines} comment lines for {code_lines} code lines",
            ))
            flagged_lines.update(range(min(scope.start_line, scope.doc_start or scope.start_line), scope.end_line + 1))
        if doc_lines >= DOCBLOCK_MIN_LINES and doc_lines > DOCBLOCK_BODY_FACTOR * code_lines:
            add(scope, NoiseFlag(
                "docblock",
                scope.doc_start,
                scope.doc_end,
                f"{doc_lines}-line docblock for {code_lines} code line{'s' if code_lines != 1 else ''}",
            ))

    # The file as a whole, only when no function already carries the flag.
    if not any(f.kind == "ratio" for f in result.file_flags):
        comment_lines, code_lines = kinds.counts(1, len(lines))
        if code_lines >= RATIO_MIN_CODE_LINES and comment_lines / code_lines > RATIO_LIMIT:
            # Marked on the first line: highlighting the whole file says nothing.
            add(None, NoiseFlag("ratio", 1, 1, f"file: {comment_lines} comment lines for {code_lines} code lines"))

    # Commented-out code: runs of whole-line comments on consecutive lines.
    run: list[CommentSpan] = []

    def flush() -> None:
        code = _code_part(run, looks_like_code) if len(run) >= COMMENTED_CODE_MIN_RUN else None
        if code:
            start, end = code[0].start_line, code[-1].end_line
            add(_innermost(scopes, start), NoiseFlag(
                "commented_code", start, end, f"commented-out code ({end - start + 1} lines)"
            ))
        run.clear()

    for c in sorted(comments, key=lambda c: c.start_line):
        whole_line = c.line_text is not None and c.start_line in kinds.comment_only and c.start_line == c.end_line
        if not whole_line:
            flush()
            continue
        if run and c.start_line != run[-1].end_line + 1:
            flush()
        run.append(c)
    flush()

    result.file_flags.sort(key=lambda f: (f.line, f.end_line))
    for flags in result.scope_flags.values():
        flags.sort(key=lambda f: (f.line, f.end_line))
    return result


def _code_part(run: list[CommentSpan], looks_like_code: Callable[[str], bool]) -> list[CommentSpan] | None:
    """The run, or the run less a prose line or two at either end, if it parses as code.

    "old approach, kept for reference:" above three lines of code shouldn't
    hide them. Long runs (license headers, essays) are skipped.
    """
    if len(run) > _MAX_RUN:
        return None
    text = "\n".join(c.line_text or "" for c in run).lower()
    if any(marker in text for marker in _DIRECTIVE_MARKERS):
        return None
    trims = sorted(((head, tail) for head in range(_MAX_TRIM + 1) for tail in range(_MAX_TRIM + 1)), key=sum)
    for head, tail in trims:
        part = run[head: len(run) - tail]
        if len(part) >= COMMENTED_CODE_MIN_RUN and looks_like_code("\n".join(c.line_text or "" for c in part)):
            return part
    return None


def _innermost(scopes: list[ScopeSpan], line: int) -> ScopeSpan | None:
    best: ScopeSpan | None = None
    for scope in scopes:
        if scope.start_line <= line <= scope.end_line:
            if best is None or scope.end_line - scope.start_line < best.end_line - best.start_line:
                best = scope
    return best


def apply(result: NoiseResult, file_metrics, scopes: list[ScopeSpan], markers) -> None:
    """Write flag counts onto the file and scopes, and mark each flag."""
    def tally(target, flags: list[NoiseFlag]) -> None:
        target.comment_noise = len(flags)
        for kind, metric in FLAG_METRIC.items():
            setattr(target, metric, sum(1 for f in flags if f.kind == kind))

    tally(file_metrics, result.file_flags)
    for scope in scopes:
        tally(scope.target, result.scope_flags.get(id(scope.target), []))
    if markers is not None:
        for flag in result.file_flags:
            markers.add_span("comment_noise", flag.line, flag.end_line, flag.note)
            markers.add_span(FLAG_METRIC[flag.kind], flag.line, flag.end_line, flag.note)


def has_code_node(node, strong_types: frozenset[str], skip: Callable[[object], bool] | None = None) -> bool:
    """Whether a parse tree holds a statement only code would have."""
    stack = [node]
    while stack:
        n = stack.pop()
        if n.type in strong_types and not (skip and skip(n)):
            return True
        stack.extend(n.children)
    return False
