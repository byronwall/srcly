"""File contents at a revision, and the named scopes the analyzers find in them.

Only changed files are read. A parsed blob is cached by its blob sha, so a file
is analyzed once however many commits, windows or requests see it.
"""

from __future__ import annotations

import multiprocessing
import os
import re
import subprocess
import tempfile
from collections import OrderedDict
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from app.config import MAX_ANALYZED_FILE_BYTES
from app.services.analysis import _scope_value, analyze_single_file, get_python_analyzer, get_ts_analyzer, language_for_path
from app.services.analysis_types import MEASURED_SCOPE_METRICS, iter_executable_scopes, scope_kind
from app.services.changelens.hunks import split_lines
from app.services.compare.git_refs import GitError

SYMBOL_LANGUAGES = frozenset({"ts", "tsx", "js", "jsx", "python", "code", "markdown"})
"""Languages whose analyzer names scopes. Every other file is grouped by line range."""
PARSE_CACHE_SIZE = 4000
POOL_AT = 150
"""Uncached blobs from which parsing moves to worker processes."""
MAX_WORKERS = 8
GIT_TIMEOUT = 60.0

_NAME = re.compile(r"^[A-Za-z_$#][\w$#.]*$")
_DECORATION = re.compile(r"^\(class\) | \((?:class|object|type)\)$")
_LEAD_IN = ("//", "/*", "*", "@")
_LEAD_IN_PYTHON = ("#", "@")
"""A comment or decorator line right above a scope belongs to that scope."""

_UNREAD_REASONS = {
    "text": "No analyzer reads this file type",
    "css": "Stylesheets have no named code scopes",
    "notebook": "Notebooks have no named code scopes",
}


@dataclass(frozen=True)
class BlobRef:
    """One side of a change: a blob in the object store, or a file on disk (the working tree)."""

    path: str
    sha: Optional[str] = None
    disk: Optional[str] = None

    @property
    def key(self) -> str:
        return self.sha or f"disk:{self.disk}"


@dataclass
class Scope:
    key: str
    """Qualified name, unique in its file: ``Foo.bar``, ``## Install``."""
    name: str
    kind: str
    """function, class or heading."""
    start: int
    end: int
    metrics: dict[str, Optional[float]]
    body: tuple[str, ...]
    """Stripped, non-blank lines: what move detection compares."""
    group: str = ""
    """The qualified name with no ordinal: scopes that share it are told apart by their bodies."""


@dataclass
class Parsed:
    language: str
    loc: int
    n_lines: int
    scopes: dict[str, Scope] = field(default_factory=dict)
    owner: list[str] = field(default_factory=list)
    """Scope key for each line (index = line number); ``""`` is the file itself."""
    blank: bytearray = field(default_factory=bytearray)
    reason: Optional[str] = None
    """Why no scopes were read, when none were."""
    file_metrics: dict[str, Optional[float]] = field(default_factory=dict)
    dupes: bool = False
    broken: bool = False
    """The grammar found a syntax error: the scopes around it can be wrong."""
    """Two scopes share a qualified name, so one key holds an ordinal (``load#2``)."""

    def owners(self, start: int, count: int) -> list[str]:
        """Scope key of each line in a hunk side.

        A blank line outside every scope goes with its neighbour in the same
        hunk: the separator added with a new function is part of that edit.
        """
        keys = [self.owner[n] if 0 < n < len(self.owner) else "" for n in range(start, start + count)]
        loose = [i for i, key in enumerate(keys) if not key and 0 < start + i < len(self.blank) and self.blank[start + i]]
        for i in loose:
            near = next((keys[j] for j in range(i - 1, -1, -1) if keys[j]), "") or next((k for k in keys[i + 1 :] if k), "")
            keys[i] = near
        return keys


_ORDINAL = re.compile(r"#\d+(?=\.|$)")
_cache: OrderedDict[tuple, Parsed] = OrderedDict()


def clear_cache() -> None:
    _cache.clear()


def _clean(name: str) -> str:
    return _DECORATION.sub("", name).replace("::", ".")


def _unique(key: str, taken: dict[str, Scope]) -> str:
    if key not in taken:
        return key
    n = 2
    while f"{key}#{n}" in taken:
        n += 1
    return f"{key}#{n}"


def _syntax_error(text: str, path: str, language: str) -> bool:
    """True when the grammar the analyzer uses for ``path`` cannot parse ``text``."""
    if language == "python":
        parser = get_python_analyzer().parser
    elif language in ("ts", "tsx", "js", "jsx"):
        analyzer = get_ts_analyzer()
        parser = analyzer.ts_parser if path.endswith("ts") else analyzer.tsx_parser
    else:
        return False
    return parser.parse(text.encode("utf-8")).root_node.has_error


def parse_text(text: str, path: str) -> Parsed:
    """Run the scan's analyzer for ``path`` on ``text`` and index its named scopes by line."""
    language = language_for_path(path)
    lines = split_lines(text)
    n = len(lines)
    blank = bytearray(n + 2)
    for i, line in enumerate(lines, start=1):
        if not line.strip():
            blank[i] = 1
    parsed = Parsed(language, sum(1 for line in lines if line.strip()), n, owner=[""] * (n + 2), blank=blank)
    if language not in SYMBOL_LANGUAGES:
        parsed.reason = _UNREAD_REASONS.get(language, _UNREAD_REASONS["text"])
        return parsed
    if len(text) > MAX_ANALYZED_FILE_BYTES:
        parsed.reason = "The file is too large to analyze"
        return parsed

    with tempfile.TemporaryDirectory(prefix="srcly-lens-") as tmp:
        target = os.path.join(tmp, os.path.basename(path) or "file")
        with open(target, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        info = analyze_single_file(target)
    if isinstance(info, dict):
        parsed.reason = f"Analysis failed: {info.get('error', 'unknown error')}"
        return parsed
    parsed.loc = int(getattr(info, "nloc", parsed.loc) or 0)
    parsed.broken = _syntax_error(text, path, language)

    measured = MEASURED_SCOPE_METRICS[language]
    display: list[Scope] = []
    executable: list[Scope] = []

    def body(start: int, end: int) -> tuple[str, ...]:
        return tuple(s for s in (line.strip() for line in lines[start - 1 : end]) if s)

    def add(key: str, name: str, kind: str, start: int, end: int, metrics: dict) -> Scope:
        scope = Scope(_unique(key, parsed.scopes), name, kind, start, min(end, n), metrics, body(start, end), _ORDINAL.sub("", key))
        parsed.dupes = parsed.dupes or scope.key != key
        parsed.scopes[scope.key] = scope
        return scope

    def walk(funcs, prefix: str, anonymous: bool = False) -> None:
        for func in funcs or []:
            start, end = int(getattr(func, "start_line", 0) or 0), int(getattr(func, "end_line", 0) or 0)
            children = getattr(func, "children", None) or []
            if language == "markdown":
                if getattr(func, "origin_type", "") == "markdown_section" and 0 < start <= end:
                    display.append(add(func.name, func.name, "heading", start, end, {}))
                walk(children, prefix)
                continue
            kind = scope_kind(func)
            name = _clean(func.name or "")
            # An object literal with no binding has the analyzer's placeholder name. It is no symbol,
            # and neither is an object under one of its keys: their lines stay with the scope around them.
            if kind == "object" and (anonymous or func.name == "object"):
                walk(children, prefix, anonymous=True)
                continue
            if kind not in ("function", "class", "type", "object") or not _NAME.match(name) or not 0 < start <= end:
                walk(children, prefix, anonymous)
                continue
            if kind == "function":
                metrics = {m: _scope_value(func, m) for m in measured}
                metrics["loc"] = func.nloc
                scope = add(prefix + name, name, "function", start, end, metrics)
                executable.append(scope)
            else:
                scope = add(prefix + name, name, "class", start, end, {"loc": func.nloc})
                display.append(scope)
            walk(children, scope.key + ".")

    walk(info.function_list, "")
    if language == "markdown":
        # The grammar ends a section on the next heading's line; that line is the next section's.
        starts = {scope.start for scope in display}
        for scope in display:
            if scope.end > scope.start and scope.end in starts:
                scope.end -= 1

    # The innermost executable scope owns a line; a display scope owns it only
    # outside every function. Wider scopes are written first.
    for group in (display, executable):
        for scope in sorted(group, key=lambda s: s.start - s.end):
            for line in range(scope.start, scope.end + 1):
                parsed.owner[line] = scope.key
    if language == "markdown":
        # A section's body is its own text: a subsection is another chunk.
        for scope in display:
            own = (lines[i - 1].strip() for i in range(scope.start, scope.end + 1) if parsed.owner[i] == scope.key)
            scope.body = tuple(text for text in own if text)
    else:
        lead_in = _LEAD_IN_PYTHON if language == "python" else _LEAD_IN
        def free(line: int, scope: Scope) -> bool:
            """No scope owns the line, or one around ``scope`` does (a class above its method's doc comment)."""
            around = parsed.scopes.get(parsed.owner[line])
            if around is None:
                return True
            return around.start <= scope.start and scope.end <= around.end and around is not scope and not (
                around.kind == "function" and scope.kind != "function"
            )

        for scope in sorted(parsed.scopes.values(), key=lambda s: s.start):
            line = scope.start - 1
            while line >= 1 and free(line, scope) and lines[line - 1].lstrip().startswith(lead_in):
                parsed.owner[line] = scope.key
                line -= 1
            scope.start = line + 1

    functions = list(iter_executable_scopes(info.function_list))
    parsed.file_metrics = {"loc": parsed.loc}
    for metric in ("complexity", "cognitive_complexity"):
        if metric in measured:
            parsed.file_metrics[metric] = max((_scope_value(f, metric) for f in functions), default=0)
    return parsed


def _parse_job(job: tuple[str, str]) -> Parsed:
    return parse_text(*job)


class BlobStore:
    """Reads blobs for one build through a single ``git cat-file --batch`` call per batch."""

    def __init__(self, repo: Path) -> None:
        self.repo = repo
        self._texts: dict[str, Optional[str]] = {}

    def _batch(self, names: list[str]) -> list[Optional[tuple[str, bytes]]]:
        """``(object sha, content)`` per name, None for a missing object or a non-blob."""
        if not names:
            return []
        try:
            proc = subprocess.run(
                ["git", "cat-file", "--batch"],
                cwd=self.repo,
                input="".join(name + "\n" for name in names).encode("utf-8"),
                capture_output=True,
                check=False,
                timeout=GIT_TIMEOUT,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise GitError(f"git cat-file failed: {exc}") from exc
        data, pos, out = proc.stdout, 0, []
        for _ in names:
            end = data.find(b"\n", pos)
            if end < 0:
                out.append(None)
                continue
            header = data[pos:end].decode("utf-8", "replace").split()
            pos = end + 1
            if len(header) == 3 and header[2].isdigit() and header[0] != "missing":
                size = int(header[2])
                content = data[pos : pos + size]
                pos += size + 1
                out.append((header[0], content) if header[1] == "blob" else None)
            else:
                out.append(None)
        return out

    @staticmethod
    def _decode(content: bytes) -> Optional[str]:
        if b"\0" in content[:8192]:
            return None
        return content.decode("utf-8", "replace")

    def lookup(self, tree: str, paths: Iterable[str]) -> dict[str, BlobRef]:
        """The blob at each path in ``tree`` (a commit or tree sha). Missing paths are left out."""
        wanted = [p for p in dict.fromkeys(paths) if "\n" not in p]
        found = {}
        for path, hit in zip(wanted, self._batch([f"{tree}:{path}" for path in wanted])):
            if hit is not None:
                sha, content = hit
                self._texts.setdefault(sha, self._decode(content))
                found[path] = BlobRef(path, sha=sha)
        return found

    def load(self, refs: Iterable[BlobRef]) -> None:
        shas = list(dict.fromkeys(r.sha for r in refs if r.sha and r.sha not in self._texts))
        for sha, hit in zip(shas, self._batch(shas)):
            self._texts[sha] = self._decode(hit[1]) if hit else None

    def text(self, ref: Optional[BlobRef]) -> Optional[str]:
        """The text of one side; None when the side is absent, unreadable or binary."""
        if ref is None:
            return None
        if ref.sha:
            if ref.sha not in self._texts:
                self.load([ref])
            return self._texts[ref.sha]
        if ref.key not in self._texts:
            try:
                with open(ref.disk or "", "rb") as f:
                    self._texts[ref.key] = self._decode(f.read())
            except OSError:
                self._texts[ref.key] = None
        return self._texts[ref.key]

    def _cache_key(self, ref: BlobRef, text: str) -> tuple:
        # The analyzer is picked by extension, so a renamed file reuses its parse.
        name = os.path.basename(ref.path).lower()
        suffix = os.path.splitext(name)[1] or name
        if ref.sha:
            return (ref.sha, suffix)
        try:
            stat = os.stat(ref.disk or "")
            return (ref.disk, stat.st_mtime_ns, stat.st_size)
        except OSError:
            return (ref.disk, len(text), hash(text))

    def warm(self, refs: Iterable[BlobRef]) -> None:
        """Parse many blobs at once. A long window has over a thousand; worker processes cut the wait."""
        jobs: dict[tuple, tuple[str, str]] = {}
        for ref in refs:
            text = self.text(ref)
            if text is None:
                continue
            key = self._cache_key(ref, text)
            if key not in _cache and key not in jobs:
                jobs[key] = (text, ref.path)
        if len(jobs) < POOL_AT:
            return
        workers = max(1, min(MAX_WORKERS, (os.cpu_count() or 2) - 1))
        try:
            with ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn")) as pool:
                for key, parsed in zip(jobs, pool.map(_parse_job, jobs.values(), chunksize=8)):
                    _cache[key] = parsed
        except Exception:
            # No pool (a sandbox, a dying worker): `parsed` reads each blob in this process instead.
            return

    def parsed(self, ref: Optional[BlobRef]) -> Optional[Parsed]:
        text = self.text(ref)
        if ref is None or text is None:
            return None
        key = self._cache_key(ref, text)
        hit = _cache.get(key)
        if hit is None:
            hit = parse_text(text, ref.path)
            _cache[key] = hit
            while len(_cache) > PARSE_CACHE_SIZE:
                _cache.popitem(last=False)
        else:
            _cache.move_to_end(key)
        return hit
