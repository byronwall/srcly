"""
Background compare jobs with pollable progress.

A compare runs ``build_compare`` on its own thread: resolve refs, scan the
base side, scan the head side, diff. Each side reports per-file progress
through a small observer, and the finished payload is encoded to JSON once
so the result endpoint never serializes on the event loop.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from app.services.compare.git_refs import GitError
from app.services.compare.service import build_compare
from app.services.scan_progress import ScanObserver
from app.services.scan_workers import CancelToken, ScanCancelled

ComparePhase = Literal["queued", "resolving", "base", "head", "diffing", "complete", "failed", "cancelled"]
TERMINAL: frozenset[str] = frozenset({"complete", "failed", "cancelled"})
MAX_FINISHED_JOBS = 4


@dataclass
class SideProgress(ScanObserver):
    files_total: int = 0
    files_done: int = 0
    current_path: Optional[str] = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def analyzing(self, files_total: int) -> None:
        with self._lock:
            self.files_total = files_total

    def file_done(self, files_done, files_total, path, failure_reason, failure_detail="") -> None:
        with self._lock:
            self.files_done, self.files_total, self.current_path = files_done, files_total, path

    def snapshot(self) -> dict:
        with self._lock:
            return {"files_total": self.files_total, "files_done": self.files_done, "current_path": self.current_path}


@dataclass
class CompareJob:
    path: Path
    base: str
    head: str
    force: bool = False
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    phase: ComparePhase = "queued"
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started: float = field(default_factory=time.monotonic)
    finished: Optional[float] = None
    cancel_token: CancelToken = field(default_factory=CancelToken)
    progress: dict[str, SideProgress] = field(
        default_factory=lambda: {"base": SideProgress(), "head": SideProgress()}
    )
    result_json: Optional[bytes] = None
    _done: threading.Event = field(default_factory=threading.Event)

    @property
    def is_finished(self) -> bool:
        return self.phase in TERMINAL

    def snapshot(self) -> dict:
        end = self.finished or time.monotonic()
        return {
            "id": self.id,
            "base": self.base,
            "head": self.head,
            "phase": self.phase,
            "error": self.error,
            "elapsed_seconds": round(end - self.started, 3),
            "sides": {name: p.snapshot() for name, p in self.progress.items()},
        }

    def wait(self, timeout: Optional[float] = None) -> bool:
        return self._done.wait(timeout)

    def run(self) -> None:
        try:
            payload = build_compare(
                self.path,
                self.base,
                self.head,
                include_sides=True,
                force=self.force,
                cancel=self.cancel_token,
                observers=self.progress,
                on_phase=self._set_phase,
            )
            self.result_json = json.dumps(payload, separators=(",", ":")).encode()
            self._finish("complete")
        except ScanCancelled:
            self._finish("cancelled")
        except GitError as exc:
            self._finish("failed", str(exc))
        except Exception as exc:  # noqa: BLE001 - surfaced to the client
            self._finish("failed", f"{type(exc).__name__}: {exc}")

    def _set_phase(self, phase: str) -> None:
        if self.cancel_token.cancelled:
            raise ScanCancelled()
        self.phase = phase  # type: ignore[assignment]

    def _finish(self, phase: ComparePhase, error: Optional[str] = None) -> None:
        self.error = error
        self.finished = time.monotonic()
        self.phase = phase
        self._done.set()


class CompareJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, CompareJob] = {}
        self._lock = threading.Lock()

    def start(self, path: Path, base: str, head: str, force: bool = False) -> CompareJob:
        with self._lock:
            for job in self._jobs.values():
                if (job.path, job.base, job.head) == (path, base, head) and not job.is_finished:
                    return job
            job = CompareJob(path=path, base=base, head=head, force=force)
            self._jobs[job.id] = job
            finished = sorted((j for j in self._jobs.values() if j.is_finished), key=lambda j: j.created_at)
            for old in finished[: max(0, len(finished) - MAX_FINISHED_JOBS)]:
                del self._jobs[old.id]
        threading.Thread(target=job.run, name=f"srcly-compare-{job.id}", daemon=True).start()
        return job

    def get(self, job_id: str) -> Optional[CompareJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel_all(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            job.cancel_token.cancel()


manager = CompareJobManager()
