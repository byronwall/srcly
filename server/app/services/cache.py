"""
Analysis cache: finished scan results, reused until the analyzed files change.

Entries live in the user's cache directory, never in the analyzed repo:

- macOS:   ~/Library/Caches/srcly/analysis
- Linux:   $XDG_CACHE_HOME/srcly/analysis (default ~/.cache/srcly/analysis)
- Windows: %LOCALAPPDATA%\\srcly\\Cache\\analysis
- Override with the ``SRCLY_CACHE_DIR`` environment variable.

Each analyzed root (by resolved path) gets a gzipped JSON tree plus a small
meta file. An entry is valid only while the root's fingerprint matches: a hash
of the relative path, mtime and size of every file discovery would consider
(the ``git ls-files`` listing in a repo, otherwise every file outside the
pruned directories), plus the srcly version. Checking it is cheap (~50ms for
2.5k files) compared to a scan, and any edit, add, delete or upgrade
invalidates the entry. The most recent entries are also kept in memory so a
reload skips the disk read and gunzip.

Cache problems are never fatal: a failed read is a miss and a failed write is
logged and ignored.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import sys
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.config import IGNORE_DIRS
from app.services import analysis

# Bump when the stored tree's shape changes in a way old entries can't serve.
CACHE_FORMAT = 2
CACHE_DIR_ENV = "SRCLY_CACHE_DIR"
# On-disk entries kept; older ones are deleted on save.
MAX_DISK_ENTRIES = 20
# In-memory entries kept. Trees for large repos are tens of MB each.
MAX_MEMORY_ENTRIES = 2


@dataclass(frozen=True)
class CachedAnalysis:
    path: str
    fingerprint: str
    data: bytes
    """The tree as JSON bytes, ready to send."""
    files_total: int
    files_failed: int
    scan_seconds: float
    created_at: float


def cache_dir() -> Path:
    override = os.environ.get(CACHE_DIR_ENV)
    if override:
        return Path(override).expanduser() / "analysis"
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Caches" / "srcly"
    elif sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or home / "AppData" / "Local") / "srcly" / "Cache"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or home / ".cache") / "srcly"
    return base / "analysis"


def _srcly_version() -> str:
    try:
        from importlib.metadata import version

        return version("srcly")
    except Exception:
        return "dev"


def _is_pruned_dir(name: str) -> bool:
    # Mirrors the directories the scan never descends into.
    return name in IGNORE_DIRS or name.startswith(".srcly")


def fingerprint(root: Path) -> str:
    """
    Hash of everything a scan of ``root`` could depend on.

    Inside a git work tree this hashes the same listing discovery uses, plus
    the ignore-rule files and the names of gitignored files, so editing an
    ignored or excluded tree (build output, agent worktrees) leaves the entry
    valid. Elsewhere it walks every file outside the pruned directories, a
    superset of what the scan reads. Either way a change can only cause a
    spurious rescan, never a stale result.
    """
    root = root.resolve()
    digest = hashlib.blake2b(digest_size=20)
    digest.update(f"srcly={_srcly_version()};format={CACHE_FORMAT}\n".encode())
    if root.is_file():
        st = root.stat()
        digest.update(f"{root.name}\0{st.st_mtime_ns}\0{st.st_size}\n".encode())
        return digest.hexdigest()

    inputs = analysis.git_fingerprint_inputs(root)
    if inputs is not None:
        for path in sorted(inputs.stats):
            st = inputs.stats[path]
            digest.update(f"{os.path.relpath(path, root)}\0{st.st_mtime_ns}\0{st.st_size}\n".encode())
        for name in sorted(set(inputs.names)):
            digest.update(f"ignored\0{os.path.relpath(name, root)}\n".encode())
        return digest.hexdigest()

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not _is_pruned_dir(d))
        rel_dir = os.path.relpath(dirpath, root)
        for name in sorted(filenames):
            try:
                st = os.stat(os.path.join(dirpath, name))
            except OSError:
                continue
            digest.update(f"{rel_dir}/{name}\0{st.st_mtime_ns}\0{st.st_size}\n".encode())
    return digest.hexdigest()


def _entry_key(root: Path) -> str:
    return hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:32]


class AnalysisCache:
    def __init__(self, directory: Optional[Path] = None, memory_entries: int = MAX_MEMORY_ENTRIES) -> None:
        self._directory = directory
        self._memory: OrderedDict[str, CachedAnalysis] = OrderedDict()
        self._memory_entries = memory_entries
        self._lock = threading.Lock()

    @property
    def directory(self) -> Path:
        return self._directory or cache_dir()

    def _paths(self, root: Path) -> tuple[Path, Path]:
        key = _entry_key(root)
        return self.directory / f"{key}.json.gz", self.directory / f"{key}.meta.json"

    def _remember(self, key: str, entry: CachedAnalysis) -> None:
        with self._lock:
            self._memory[key] = entry
            self._memory.move_to_end(key)
            while len(self._memory) > self._memory_entries:
                self._memory.popitem(last=False)

    def load(self, root: Path, current_fingerprint: Optional[str] = None) -> Optional[CachedAnalysis]:
        """Return the cached analysis for ``root`` if its files are unchanged."""
        key = _entry_key(root)
        current = current_fingerprint or fingerprint(root)
        with self._lock:
            entry = self._memory.get(key)
        if entry is None or entry.fingerprint != current:
            entry = self._read_disk(root, current)
            if entry is None:
                return None
        self._remember(key, entry)
        return entry

    def _read_disk(self, root: Path, expected_fingerprint: str) -> Optional[CachedAnalysis]:
        data_path, meta_path = self._paths(root)
        try:
            meta = json.loads(meta_path.read_text())
            if (
                meta.get("format") != CACHE_FORMAT
                or meta.get("path") != str(root.resolve())
                or meta.get("fingerprint") != expected_fingerprint
            ):
                return None
            data = gzip.decompress(data_path.read_bytes())
            return CachedAnalysis(
                path=meta["path"],
                fingerprint=meta["fingerprint"],
                data=data,
                files_total=int(meta.get("files_total", 0)),
                files_failed=int(meta.get("files_failed", 0)),
                scan_seconds=float(meta.get("scan_seconds", 0.0)),
                created_at=float(meta.get("created_at", 0.0)),
            )
        except (OSError, ValueError, KeyError, EOFError, gzip.BadGzipFile):
            return None

    def save(
        self,
        root: Path,
        root_fingerprint: str,
        data: bytes,
        *,
        files_total: int = 0,
        files_failed: int = 0,
        scan_seconds: float = 0.0,
    ) -> Optional[CachedAnalysis]:
        entry = CachedAnalysis(
            path=str(root.resolve()),
            fingerprint=root_fingerprint,
            data=data,
            files_total=files_total,
            files_failed=files_failed,
            scan_seconds=scan_seconds,
            created_at=time.time(),
        )
        self._remember(_entry_key(root), entry)
        try:
            self._write_disk(root, entry)
        except OSError as exc:
            print(f"⚠️  Could not write analysis cache for {root}: {exc}", flush=True)
        return entry

    def _write_disk(self, root: Path, entry: CachedAnalysis) -> None:
        directory = self.directory
        directory.mkdir(parents=True, exist_ok=True)
        data_path, meta_path = self._paths(root)
        meta = {
            "format": CACHE_FORMAT,
            "path": entry.path,
            "fingerprint": entry.fingerprint,
            "files_total": entry.files_total,
            "files_failed": entry.files_failed,
            "scan_seconds": entry.scan_seconds,
            "created_at": entry.created_at,
        }
        # Write the payload before the meta so a reader never sees meta for a
        # half-written tree; os.replace makes each file appear atomically.
        suffix = f".{os.getpid()}.{threading.get_ident()}.tmp"
        tmp_data = data_path.with_name(data_path.name + suffix)
        tmp_meta = meta_path.with_name(meta_path.name + suffix)
        tmp_data.write_bytes(gzip.compress(entry.data, compresslevel=1))
        os.replace(tmp_data, data_path)
        tmp_meta.write_text(json.dumps(meta))
        os.replace(tmp_meta, meta_path)
        self._prune_disk()

    def _prune_disk(self) -> None:
        metas = sorted(self.directory.glob("*.meta.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for meta_path in metas[MAX_DISK_ENTRIES:]:
            key = meta_path.name.removesuffix(".meta.json")
            for path in (meta_path, self.directory / f"{key}.json.gz"):
                path.unlink(missing_ok=True)

    def invalidate(self, root: Path) -> None:
        key = _entry_key(root)
        with self._lock:
            self._memory.pop(key, None)
        for path in self._paths(root):
            path.unlink(missing_ok=True)

    def clear_memory(self) -> None:
        with self._lock:
            self._memory.clear()


analysis_cache = AnalysisCache()
