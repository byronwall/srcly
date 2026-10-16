"""Background findings jobs, one per scanned folder and file fingerprint.

A scan starts its findings job when it starts (or when a cached result is
served), so the checks run beside the analyzers instead of after them, and
the treemap never waits for ``tsc``. Until the job ends the served tree says
the checks are still running; the client polls and refetches.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

from app.services.findings import runner
from app.services.findings.model import FindingsResult

MAX_JOBS = 8


class FindingsJob:
    def __init__(self, root: Path, fingerprint: Optional[str]) -> None:
        self.root = root
        self.fingerprint = fingerprint
        self._result: Optional[FindingsResult] = None
        self._done = threading.Event()

    @property
    def result(self) -> FindingsResult:
        """The finished result, or a ``running`` placeholder."""
        return self._result or FindingsResult(root=str(self.root), status="running")

    @property
    def finished(self) -> bool:
        return self._done.is_set()

    def wait(self, timeout: Optional[float] = None) -> bool:
        return self._done.wait(timeout)

    def run(self) -> None:
        try:
            self._result = runner.collect(self.root, fingerprint=self.fingerprint)
        except Exception as exc:  # noqa: BLE001 - planning itself failed; say so
            self._result = FindingsResult(
                root=str(self.root), status="na", reason=f"Checks failed to start: {type(exc).__name__}: {exc}"
            )
        finally:
            self._done.set()


class FindingsJobManager:
    def __init__(self) -> None:
        self._jobs: list[FindingsJob] = []
        self._lock = threading.Lock()

    def start(self, root: Path, fingerprint: Optional[str]) -> FindingsJob:
        """The job for ``root`` at ``fingerprint``, started if new."""
        root = root.resolve()
        with self._lock:
            for job in reversed(self._jobs):
                if job.root == root and job.fingerprint == fingerprint and fingerprint is not None:
                    return job
            job = FindingsJob(root, fingerprint)
            self._jobs.append(job)
            del self._jobs[:-MAX_JOBS]
        threading.Thread(target=job.run, name="srcly-findings-job", daemon=True).start()
        return job

    def latest(self, root: Path) -> Optional[FindingsJob]:
        root = root.resolve()
        with self._lock:
            return next((j for j in reversed(self._jobs) if j.root == root), None)

    def for_file(self, path: Path) -> Optional[FindingsJob]:
        """The newest job whose folder contains ``path`` (finished ones first)."""
        path = path.resolve()
        with self._lock:
            jobs = [j for j in reversed(self._jobs) if j.root == path or j.root in path.parents]
        return next((j for j in jobs if j.finished), jobs[0] if jobs else None)

    def clear(self) -> None:
        with self._lock:
            self._jobs.clear()


manager = FindingsJobManager()
