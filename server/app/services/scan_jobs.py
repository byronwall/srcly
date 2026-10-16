"""
Background scan jobs with pollable progress, used by the SSE progress API.

A job runs ``analysis.scan_codebase`` on its own thread and records progress
in a snapshot guarded by a lock. Every change bumps ``version``; readers (the
SSE stream, the polling endpoint) compare versions to decide whether there is
anything new to send. Nothing here touches asyncio, so the scan thread never
needs to coordinate with the event loop.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from app.models import Node
from app.services import activity, analysis, cache, findings
from app.services.scan_progress import ScanObserver
from app.services.scan_workers import CancelToken, ScanCancelled

ScanPhase = Literal["queued", "discovering", "analyzing", "building", "complete", "failed", "cancelled"]
TERMINAL_PHASES: frozenset[str] = frozenset({"complete", "failed", "cancelled"})

# Finished jobs kept around so late subscribers can still read the outcome and
# fetch the result. Results can be large, so keep this small.
MAX_FINISHED_JOBS = 4
# Most recent per-file failures included in snapshots.
MAX_REPORTED_FAILURES = 20
# Longest-running in-flight files included in snapshots.
MAX_REPORTED_IN_PROGRESS = 5


def serialize_tree(tree: Node) -> bytes:
    """Encode a tree exactly as FastAPI would for ``response_model=Node``."""
    return tree.model_dump_json(by_alias=True).encode()


@dataclass
class _Failure:
    path: str
    reason: str
    detail: str


@dataclass
class ScanJob(ScanObserver):
    root_path: Path
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    cancel_token: CancelToken = field(default_factory=CancelToken)

    phase: ScanPhase = "queued"
    files_discovered: int = 0
    files_total: int = 0
    files_done: int = 0
    files_failed: int = 0
    current_path: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_monotonic: Optional[float] = None
    finished_monotonic: Optional[float] = None
    result: Optional[Node] = None
    version: int = 0
    # True when the result came from the analysis cache instead of a scan.
    cached: bool = False
    # Fingerprint of the root taken before scanning, for the cache entry.
    fingerprint: Optional[str] = None
    # When the cached result was taken (Unix seconds), for cached jobs.
    cached_at: Optional[float] = None

    _failures: deque = field(default_factory=lambda: deque(maxlen=MAX_REPORTED_FAILURES))
    # path -> monotonic start time, insertion-ordered so the oldest is first.
    _in_progress: dict = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _done: threading.Event = field(default_factory=threading.Event)
    _result_json: Optional[bytes] = None
    _result_json_lock: threading.Lock = field(default_factory=threading.Lock)
    # window -> (activity + findings state the bytes were built with, bytes)
    _overlay_json: dict = field(default_factory=dict)
    # Lint and type checks, run beside the scan (``services/findings``).
    findings_job: Optional[findings.FindingsJob] = None

    # -- state -------------------------------------------------------------

    @property
    def finished(self) -> bool:
        return self.phase in TERMINAL_PHASES

    def _update(self, **changes) -> None:
        with self._lock:
            for key, value in changes.items():
                setattr(self, key, value)
            self.version += 1

    def snapshot(self) -> dict:
        with self._lock:
            now = time.monotonic()
            end = self.finished_monotonic or now
            elapsed = 0.0 if self.started_monotonic is None else end - self.started_monotonic
            return {
                "id": self.id,
                "path": str(self.root_path),
                "phase": self.phase,
                "version": self.version,
                "files_discovered": self.files_discovered,
                "files_total": self.files_total,
                "files_done": self.files_done,
                "files_failed": self.files_failed,
                "current_path": self.current_path,
                "elapsed_seconds": round(elapsed, 3),
                "error": self.error,
                "cached": self.cached,
                "cached_at": self.cached_at,
                "failures": [
                    {"path": f.path, "reason": f.reason, "detail": f.detail} for f in self._failures
                ],
                "in_progress": [
                    {"path": path, "running_seconds": round(now - started, 1)}
                    for path, started in list(self._in_progress.items())[:MAX_REPORTED_IN_PROGRESS]
                ],
            }

    def wait(self, timeout: Optional[float] = None) -> bool:
        """Block until the job finishes. Returns False on timeout."""
        return self._done.wait(timeout)

    def cancel(self) -> None:
        self.cancel_token.cancel()

    def result_json(self) -> bytes:
        """
        The result tree as JSON bytes, encoded once and shared by every reader.

        Large repos produce trees of tens of MB. Letting FastAPI serialize a
        ``Node`` response runs the encoding on the event loop, which stalls
        every other request for seconds. Callers run this in a worker thread
        (a plain ``def`` endpoint) and return the bytes as-is.
        """
        with self._result_json_lock:
            if self._result_json is None:
                if self.result is None:
                    raise ValueError(f"Scan {self.id} has no result (phase: {self.phase})")
                self._result_json = serialize_tree(self.result)
            return self._result_json

    def result_json_overlaid(self, window: Optional[str] = None) -> bytes:
        """
        The result tree with Git activity for ``window`` and the lint/type
        findings laid over it.

        The analysis cache stores the tree without either, so a new window,
        HEAD, or finished checks only redo the overlay, never the analyzers.
        Bytes are reused while neither changed.
        """
        window = activity.normalize_window(window)
        result = activity.collect(self.root_path, window)
        checks = self.findings_result()
        signature = (
            result.status, result.reason, result.note, result.head, result.repo_root, len(result.files),
            checks.status, id(self.findings_job),
        )
        with self._result_json_lock:
            hit = self._overlay_json.get(window)
            if hit is not None and hit[0] == signature:
                return hit[1]
        tree = json.loads(self.result_json())
        activity.apply_to_tree(tree, result, activity.scan_path_mapper(self.root_path, result))
        findings.apply_to_tree(tree, checks)
        data = json.dumps(tree, separators=(",", ":")).encode()
        with self._result_json_lock:
            self._overlay_json[window] = (signature, data)
        return data

    def start_findings(self) -> None:
        if self.findings_job is None:
            self.findings_job = findings.manager.start(self.root_path, self.fingerprint)

    def findings_result(self) -> findings.FindingsResult:
        if self.findings_job is None:
            return findings.FindingsResult(root=str(self.root_path), status="na", reason="Checks did not start")
        return self.findings_job.result

    # -- ScanObserver --------------------------------------------------------

    def discovering(self, files_found: int, current_dir: str) -> None:
        self._update(phase="discovering", files_discovered=files_found, current_path=current_dir)

    def analyzing(self, files_total: int) -> None:
        self._update(
            phase="analyzing",
            files_discovered=files_total,
            files_total=files_total,
            current_path=None,
        )

    def file_started(self, path: str) -> None:
        with self._lock:
            self._in_progress[path] = time.monotonic()
            self.version += 1

    def file_done(self, files_done, files_total, path, failure_reason, failure_detail="") -> None:
        with self._lock:
            self._in_progress.pop(path, None)
            self.files_done = files_done
            self.files_total = files_total
            self.current_path = path
            if failure_reason is not None:
                self.files_failed += 1
                self._failures.append(_Failure(path, failure_reason, failure_detail))
            self.version += 1

    def building(self) -> None:
        self._update(phase="building", current_path=None)

    # -- execution -----------------------------------------------------------

    @classmethod
    def from_cache(cls, root_path: Path, entry: cache.CachedAnalysis) -> "ScanJob":
        """A job that is already complete, serving a cached result."""
        now = time.monotonic()
        job = cls(
            root_path=root_path,
            phase="complete",
            files_discovered=entry.files_total,
            files_total=entry.files_total,
            files_done=entry.files_total,
            files_failed=entry.files_failed,
            started_monotonic=now,
            finished_monotonic=now,
            cached=True,
            cached_at=entry.created_at,
            fingerprint=entry.fingerprint,
        )
        job._result_json = entry.data
        job._done.set()
        job.start_findings()
        return job

    def run(self) -> None:
        self._update(started_monotonic=time.monotonic())
        try:
            # Taken before scanning: an edit made mid-scan then invalidates
            # the entry instead of being silently baked into it.
            self.fingerprint = cache.fingerprint(self.root_path)
            # Checks run beside the analyzers; the result waits for neither.
            self.start_findings()
            tree = analysis.scan_codebase(
                self.root_path, verbose=False, cancel=self.cancel_token, observer=self
            )
        except ScanCancelled:
            self._finish("cancelled")
        except Exception as exc:  # noqa: BLE001 - surfaced to the client
            self._finish("failed", error=f"{type(exc).__name__}: {exc}")
        else:
            self._finish("complete", result=tree)
            self._save_to_cache()

    def _save_to_cache(self) -> None:
        try:
            snapshot = self.snapshot()
            cache.analysis_cache.save(
                self.root_path,
                self.fingerprint,
                self.result_json(),
                files_total=snapshot["files_total"],
                files_failed=snapshot["files_failed"],
                scan_seconds=snapshot["elapsed_seconds"],
            )
        except Exception as exc:  # noqa: BLE001 - the cache is best-effort
            print(f"⚠️  Could not cache analysis of {self.root_path}: {exc}", flush=True)

    def _finish(self, phase: ScanPhase, **changes) -> None:
        with self._lock:
            self._in_progress.clear()
        self._update(phase=phase, current_path=None, finished_monotonic=time.monotonic(), **changes)
        self._done.set()


class ScanJobManager:
    """Owns scan jobs: starts them, deduplicates by path, and prunes old ones."""

    def __init__(self, max_finished: int = MAX_FINISHED_JOBS) -> None:
        self._jobs: dict[str, ScanJob] = {}
        self._lock = threading.Lock()
        self._max_finished = max_finished

    def start(self, root_path: Path, force: bool = False) -> ScanJob:
        """
        Start a scan of ``root_path``, or return the one already running for it.

        Unless ``force`` is set, an unchanged cached analysis is returned as an
        already-complete job without scanning.
        """
        resolved = root_path.resolve()
        with self._lock:
            running = self._running_locked(resolved)
            if running is not None:
                return running

        # Checking the cache walks the tree, so do it outside the lock.
        entry = None if force else cache.analysis_cache.load(resolved)

        with self._lock:
            running = self._running_locked(resolved)
            if running is not None:
                return running
            job = ScanJob.from_cache(resolved, entry) if entry else ScanJob(root_path=resolved)
            self._jobs[job.id] = job
            self._prune_locked()

        if not job.finished:
            thread = threading.Thread(target=job.run, name=f"srcly-scan-{job.id}", daemon=True)
            thread.start()
        return job

    def _running_locked(self, resolved: Path) -> Optional[ScanJob]:
        for job in self._jobs.values():
            if job.root_path == resolved and not job.finished and not job.cancel_token.cancelled:
                return job
        return None

    def get(self, job_id: str) -> Optional[ScanJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> Optional[ScanJob]:
        job = self.get(job_id)
        if job is not None:
            job.cancel()
        return job

    def cancel_all(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            job.cancel()

    def _prune_locked(self) -> None:
        finished = sorted(
            (job for job in self._jobs.values() if job.finished),
            key=lambda job: job.created_at,
        )
        for job in finished[: max(0, len(finished) - self._max_finished)]:
            del self._jobs[job.id]


manager = ScanJobManager()
