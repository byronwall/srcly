"""Git diffs as per-file hunks: one ``git log -p -U0`` pass for the commits, one diff for the working tree, one for net."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import BINARY_EXTENSIONS, IGNORE_FILES
from app.services.analysis import _has_ignored_extension, _is_pruned_dir_name, classify_candidate
from app.services.compare.git_refs import GitError, GitTimeout

GIT_TIMEOUT = 60.0
RECORD = "\x1e"
_LOG_FORMAT = f"--format={RECORD}%H"
_DIFF_FLAGS = ("--raw", "--no-abbrev", "-p", "-U0", "-M", "--no-color", "--no-ext-diff", "--no-textconv")
_HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
_NULL_SHA = "0" * 40
_FILE_MODES = {"100644", "100755"}


def git(repo: Path, *args: str, timeout: float = GIT_TIMEOUT) -> str:
    """Git output with its bytes kept. Text mode would turn a lone CR in a file's content into a line break."""
    try:
        proc = subprocess.run(["git", "-c", "core.quotepath=off", *args], cwd=repo, capture_output=True, check=False, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise GitTimeout(f"git {' '.join(args)} timed out after {timeout:g}s") from exc
    except OSError as exc:
        raise GitError(f"git is not available: {exc}") from exc
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {proc.stderr.decode('utf-8', 'replace').strip()}")
    return proc.stdout.decode("utf-8", "replace")


def split_lines(text: str) -> list[str]:
    """Lines as git counts them: a line ends at ``\\n`` only, never at a CR, a form feed or U+2028."""
    lines = text.split("\n")
    if lines[-1] == "":
        lines.pop()
    return lines


@dataclass(frozen=True)
class Hunk:
    """Line ranges as git prints them with ``-U0``: ``old_lines`` deleted, ``new_lines`` added."""

    old_start: int
    old_lines: int
    new_start: int
    new_lines: int


@dataclass
class FileDiff:
    status: str
    """A, M, D or R."""
    old_path: Optional[str]
    new_path: Optional[str]
    old_sha: Optional[str]
    new_sha: Optional[str]
    """None when the side is absent, or when the new side is a file on disk."""
    hunks: list[Hunk] = field(default_factory=list)
    binary: bool = False

    @property
    def path(self) -> str:
        return self.new_path or self.old_path or ""

    @property
    def added(self) -> int:
        return sum(h.new_lines for h in self.hunks)

    @property
    def deleted(self) -> int:
        return sum(h.old_lines for h in self.hunks)


def is_skipped(path: str) -> bool:
    """True for a path srcly's scan never lists: ignored names and extensions, binary types, pruned folders."""
    parts = path.split("/")
    name = parts[-1]
    if any(_is_pruned_dir_name(part) for part in parts[:-1]):
        return True
    if name in IGNORE_FILES or _has_ignored_extension(name):
        return True
    return Path(name).suffix.lower() in BINARY_EXTENSIONS


def _unquote(path: str) -> str:
    """Git quotes a path with a tab, a newline or a quote in it, C style."""
    if len(path) >= 2 and path.startswith('"') and path.endswith('"'):
        try:
            return path[1:-1].encode("latin-1", "backslashreplace").decode("unicode_escape").encode("latin-1").decode("utf-8")
        except (UnicodeError, ValueError):
            return path[1:-1]
    return path


def _raw_entry(line: str) -> Optional[FileDiff]:
    meta, _, rest = line.partition("\t")
    fields = meta.split()
    if len(fields) != 5:
        return None
    old_mode, new_mode, old_sha, new_sha, status = fields[0].lstrip(":"), fields[1], fields[2], fields[3], fields[4][0]
    paths = [_unquote(p) for p in rest.split("\t")]
    if status in ("R", "C") and len(paths) == 2:
        old_path, new_path = paths
        if status == "C":
            status, old_path, old_sha = "A", None, _NULL_SHA
    else:
        old_path = new_path = paths[0]
    if status == "T":
        status = "M"
    if status not in ("A", "M", "D", "R"):
        return None
    diff = FileDiff(
        status,
        None if status == "A" else old_path,
        None if status == "D" else new_path,
        None if status == "A" or old_sha == _NULL_SHA else old_sha,
        None if status == "D" or new_sha == _NULL_SHA else new_sha,
    )
    # Symlinks and submodules are not files to read. Marked like binaries, so they are left out.
    live_modes = [m for m in (old_mode, new_mode) if m != "000000"]
    if any(m not in _FILE_MODES for m in live_modes):
        diff.binary = True
    return diff


def parse(text: str) -> dict[str, list[FileDiff]]:
    """Parse ``--raw -p -U0`` output. Keys are commit shas; a plain ``git diff`` lands under ``""``.

    Git prints one raw line and then one ``diff --git`` section per file, in the same order.
    """
    out: dict[str, list[FileDiff]] = {}
    entries: list[FileDiff] = out.setdefault("", [])
    section = -1
    for line in text.split("\n"):
        if not line:
            continue
        first = line[0]
        if first in "+- \\":
            continue
        if first == RECORD:
            entries = out.setdefault(line[1:].strip(), [])
            section = -1
        elif first == ":":
            entry = _raw_entry(line)
            # A placeholder keeps sections and entries in step.
            entries.append(entry or FileDiff("M", None, None, None, None, binary=True))
        elif line.startswith("diff --git "):
            section += 1
        elif first == "@":
            match = _HUNK.match(line)
            if match and 0 <= section < len(entries):
                old_start, old_lines, new_start, new_lines = match.groups()
                entries[section].hunks.append(
                    Hunk(int(old_start), int(old_lines or 1), int(new_start), int(new_lines or 1))
                )
        elif line.startswith(("Binary files ", "GIT binary patch")) and 0 <= section < len(entries):
            entries[section].binary = True
    if not out[""]:
        del out[""]
    return out


def _pathspec(scope: str) -> list[str]:
    return ["--", scope] if scope else []


def commit_diffs(repo: Path, shas: list[str], scope: str) -> dict[str, list[FileDiff]]:
    """Each commit's diff against its first parent."""
    if not shas:
        return {}
    text = git(repo, "log", "--no-walk=unsorted", "--diff-merges=first-parent", _LOG_FORMAT, *_DIFF_FLAGS, *shas, *_pathspec(scope))
    return parse(text)


def tree_diff(repo: Path, base: str, head: Optional[str], scope: str) -> list[FileDiff]:
    """``base`` against ``head``, or against the files on disk (untracked files count as added) when ``head`` is None."""
    revs = [base] if head is None else [base, head]
    text = git(repo, "diff", *_DIFF_FLAGS, *revs, *_pathspec(scope))
    diffs = parse(text).get("", [])
    if head is None:
        diffs.extend(_untracked(repo, scope))
    return diffs


def _untracked(repo: Path, scope: str) -> list[FileDiff]:
    raw = git(repo, "ls-files", "-z", "--others", "--exclude-standard", *_pathspec(scope))
    out = []
    for path in filter(None, raw.split("\0")):
        if is_skipped(path):
            continue
        full = repo / path
        if not full.is_file() or full.is_symlink() or classify_candidate(full) != "ok":
            continue
        try:
            with open(full, "rb") as f:
                data = f.read()
            lines = data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)
        except OSError:
            continue
        diff = FileDiff("A", None, path, None, None)
        if lines:
            diff.hunks.append(Hunk(0, 0, 1, lines))
        out.append(diff)
    return out


def kept(diffs: list[FileDiff]) -> list[FileDiff]:
    """The diffs Change Lens reads: not binary, and not skipped by srcly's ignore rules."""
    return [d for d in diffs if not d.binary and not is_skipped(d.path)]
