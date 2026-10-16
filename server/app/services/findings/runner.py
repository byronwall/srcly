"""Plan the tools for a folder, run each as its own guarded job, and cache the result."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Sequence

from app.services.findings import builtin_ts, ruff, typescript
from app.services.findings.model import Finding, FindingsResult, ToolRun
from app.services.findings.tools import Tool, run

FINDINGS_FORMAT = 1
MAX_MEMORY_ENTRIES = 8
MAX_DISK_ENTRIES = 40
# A thread that outlives its tool's own timeout by this much is abandoned.
GRACE_SECONDS = 15.0


def plan_tools(root: Path, *, portable: bool = False, stop: Optional[Path] = None) -> list[Tool]:
    """
    The tools to run for ``root``, with no configuration:

    - the project's ``tsc`` per tsconfig and ``eslint`` per config, when the
      project has both the binary and the config (skipped when ``portable``,
      for compare snapshots that have no ``node_modules``);
    - ``ruff`` for Python, with the project's config or srcly's defaults;
    - srcly's TS rules for TS files outside every project tsc/eslint folder.
    """
    root = root.resolve()
    if stop is None:
        from app.services.analysis import find_repo_root

        stop = find_repo_root(root if root.is_dir() else root.parent)
    project_ts = [] if portable else typescript.plan(root, stop)
    return [
        *project_ts,
        *ruff.plan(root, stop),
        builtin_ts.BuiltinTsTool(root, skip_dirs=typescript.project_dirs(project_ts)),
    ]


def _dedupe(findings: list[Finding]) -> list[Finding]:
    """Two tsc projects sharing a file report its errors twice; keep one."""
    seen: set[tuple] = set()
    out = []
    for f in findings:
        key = (f.tool.split(":", 1)[0], f.path, f.line, f.column, f.rule, f.message)
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def run_tools(root: Path, tools: Sequence[Tool]) -> FindingsResult:
    """Run every tool at once, each on its own thread with its own timeout."""
    runs: list[ToolRun] = []
    findings: list[Finding] = []
    if tools:
        pool = ThreadPoolExecutor(max_workers=len(tools), thread_name_prefix="srcly-findings")
        futures = [(tool, pool.submit(run, tool)) for tool in tools]
        for tool, future in futures:
            try:
                tool_run, tool_findings = future.result(timeout=tool.timeout + GRACE_SECONDS)
            except Exception:  # noqa: BLE001 - a stuck thread is a timeout
                tool_run, tool_findings = tool.new_run(), []
                tool_run.status, tool_run.reason = "na", f"{tool.label} timed out after {tool.timeout:g}s"
            runs.append(tool_run)
            findings.extend(tool_findings)
        pool.shutdown(wait=False)
    findings = _dedupe(findings)
    counts: dict[str, list[int]] = {}
    for f in findings:
        c = counts.setdefault(f.tool, [0, 0])
        c[0] += 1
        c[1] += f.severity == "error"
    for tool_run in runs:
        if tool_run.ok:
            tool_run.finding_count, tool_run.error_count = counts.get(tool_run.id, (0, 0))
    findings.sort(key=lambda f: (f.path, f.line, f.column, f.tool, f.rule))
    return FindingsResult(root=str(root.resolve()), status="ok", tools=runs, findings=findings)


# -- cache -------------------------------------------------------------------


class FindingsCache:
    """Results by root + file fingerprint + tool signatures, in memory and gzipped on disk."""

    def __init__(self, directory: Optional[Path] = None) -> None:
        self._directory = directory
        self._memory: OrderedDict[str, FindingsResult] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def directory(self) -> Path:
        if self._directory is not None:
            return self._directory
        from app.services.cache import cache_dir

        return cache_dir().parent / "findings"

    def get(self, key: str) -> Optional[FindingsResult]:
        with self._lock:
            hit = self._memory.get(key)
            if hit is not None:
                self._memory.move_to_end(key)
                return hit
        try:
            with gzip.open(self.directory / f"{key}.json.gz", "rt", encoding="utf-8") as fh:
                result = FindingsResult.from_dict(json.load(fh))
        except Exception:  # noqa: BLE001 - a bad entry is a miss
            return None
        self._remember(key, result)
        return result

    def put(self, key: str, result: FindingsResult) -> None:
        self._remember(key, result)
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            target = self.directory / f"{key}.json.gz"
            tmp = target.with_suffix(f".{os.getpid()}.tmp")
            with gzip.open(tmp, "wt", encoding="utf-8") as fh:
                json.dump(result.as_dict(), fh)
            os.replace(tmp, target)
            entries = sorted(self.directory.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
            for stale in entries[MAX_DISK_ENTRIES:]:
                stale.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001 - the cache is best-effort
            print(f"⚠️  Could not cache findings: {exc}", flush=True)

    def _remember(self, key: str, result: FindingsResult) -> None:
        with self._lock:
            self._memory[key] = result
            self._memory.move_to_end(key)
            while len(self._memory) > MAX_MEMORY_ENTRIES:
                self._memory.popitem(last=False)

    def clear_memory(self) -> None:
        with self._lock:
            self._memory.clear()


findings_cache = FindingsCache()


def cache_key(root: Path, fingerprint: str, tools: Sequence[Tool], portable: bool) -> str:
    signatures = "\n".join(sorted(t.signature() for t in tools))
    raw = f"format={FINDINGS_FORMAT};{root.resolve()};{fingerprint};{portable};{signatures}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def collect(
    root: Path,
    *,
    fingerprint: Optional[str] = None,
    portable: bool = False,
    tools: Optional[Sequence[Tool]] = None,
    cache: Optional[FindingsCache] = None,
    use_cache: bool = True,
) -> FindingsResult:
    """
    Findings for ``root``. Never raises for tool problems: each tool that is
    missing, fails or times out comes back N/A with its reason. Cached only
    when a ``fingerprint`` of the scanned files is given.
    """
    root = root.resolve()
    tools = list(tools) if tools is not None else plan_tools(root, portable=portable)
    store = cache or findings_cache
    key = cache_key(root, fingerprint, tools, portable) if (use_cache and fingerprint) else None
    if key:
        hit = store.get(key)
        if hit is not None:
            return hit
    result = run_tools(root, tools)
    # A timeout or crash may not happen next time, so only clean runs are kept.
    if key and all(t.ok for t in result.tools):
        store.put(key, result)
    return result
