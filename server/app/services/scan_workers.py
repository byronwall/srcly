"""
Process pool for per-file analysis with hard timeouts and cooperative cancellation.

Why not ``concurrent.futures.ProcessPoolExecutor``? A stuck tree-sitter parse
cannot be interrupted from the outside, and the executor has no way to kill a
single hung task. Here every worker owns a private pipe, so the parent can
terminate exactly the worker that blew its deadline and start a replacement
while the rest keep going.

Workers are long-lived (spawning a fresh interpreter per file costs far more
than analyzing most files) and recycled after ``max_tasks_per_worker`` tasks to
bound memory growth from native parsers.

Signals: a terminal Ctrl+C sends SIGINT to the whole foreground process group.
Workers ignore it so the parent alone decides how to shut down. SIGINT is
blocked in the calling thread while a worker is started so the child inherits
the blocked mask and cannot die mid-bootstrap with a KeyboardInterrupt
traceback; the child installs SIG_IGN and then unblocks.
"""

from __future__ import annotations

import multiprocessing
import signal
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from multiprocessing.connection import wait as wait_for_ready
from typing import Any, Callable, Iterator, Optional


class ScanCancelled(Exception):
    """Raised when a scan is cancelled through its ``CancelToken``."""


class CancelToken:
    """Thread-safe cancellation flag shared between a scan and its owner."""

    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    def raise_if_cancelled(self) -> None:
        if self._event.is_set():
            raise ScanCancelled()


@dataclass
class FileFailure:
    path: str
    reason: str  # "timeout" | "error" | "crash"
    detail: str = ""


@dataclass
class PoolOutcome:
    results: list[Any] = field(default_factory=list)
    failures: list[FileFailure] = field(default_factory=list)


# Called with (completed_count, total_count, path, failure_or_None) after each file.
FileDoneCallback = Callable[[int, int, str, Optional[FileFailure]], None]
# Called with (started_index, total_count, path) before each file is dispatched.
FileStartCallback = Callable[[int, int, str], None]


def _worker_main(conn, analyze_fn: Optional[Callable[[str], Any]] = None) -> None:
    """Child-process loop: receive a path, analyze it, send the result back."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    if hasattr(signal, "pthread_sigmask"):
        signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT})

    if analyze_fn is None:
        # Imported here so the parent can import this module without pulling in
        # every analyzer, and to avoid a circular import with analysis.py.
        from app.services.analysis import analyze_single_file as analyze_fn

    while True:
        try:
            path = conn.recv()
        except (EOFError, OSError):
            return
        if path is None:
            return
        try:
            result = analyze_fn(path)
        except BaseException as exc:  # noqa: BLE001 - report anything back
            result = {"error": str(exc), "filename": path}
        try:
            conn.send(result)
        except Exception as exc:  # e.g. unpicklable result
            try:
                conn.send({"error": f"could not send result: {exc}", "filename": path})
            except Exception:
                return


@contextmanager
def _sigint_blocked() -> Iterator[None]:
    if not hasattr(signal, "pthread_sigmask"):
        yield
        return
    previous = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT})
    try:
        yield
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, previous)


class _Worker:
    def __init__(self, ctx, analyze_fn: Optional[Callable[[str], Any]] = None) -> None:
        self.conn, child_conn = ctx.Pipe(duplex=True)
        self.proc = ctx.Process(target=_worker_main, args=(child_conn, analyze_fn), daemon=True)
        with _sigint_blocked():
            self.proc.start()
        child_conn.close()
        self.path: Optional[str] = None
        self.started_at = 0.0
        self.tasks_done = 0

    @property
    def busy(self) -> bool:
        return self.path is not None

    def assign(self, path: str) -> None:
        self.conn.send(path)
        self.path = path
        self.started_at = time.monotonic()

    def finish(self) -> None:
        self.path = None
        self.tasks_done += 1

    def stop(self, *, graceful: bool) -> None:
        if graceful and self.proc.is_alive():
            try:
                self.conn.send(None)
            except Exception:
                pass
            self.proc.join(timeout=0.5)
        self.kill()

    def kill(self) -> None:
        if self.proc.is_alive():
            self.proc.terminate()
            self.proc.join(timeout=1.0)
        if self.proc.is_alive():
            self.proc.kill()
            self.proc.join(timeout=1.0)
        try:
            self.conn.close()
        except Exception:
            pass


def run_file_analyses(
    files: list[str],
    *,
    timeout_seconds: float,
    max_workers: int,
    cancel: Optional[CancelToken] = None,
    on_file_start: Optional[FileStartCallback] = None,
    on_file_done: Optional[FileDoneCallback] = None,
    max_tasks_per_worker: int = 250,
    poll_interval: float = 0.1,
    analyze_fn: Optional[Callable[[str], Any]] = None,
) -> PoolOutcome:
    """
    Analyze ``files`` in a pool of worker processes.

    Raises ``ScanCancelled`` if ``cancel`` fires, and propagates
    ``KeyboardInterrupt``; in both cases every worker is killed before
    returning so no orphan processes outlive the scan.

    ``analyze_fn`` must be a picklable module-level function; it defaults to
    ``analysis.analyze_single_file`` and exists so tests can inject behavior.
    """
    outcome = PoolOutcome()
    total = len(files)
    if total == 0:
        return outcome

    ctx = multiprocessing.get_context("spawn")
    worker_count = max(1, min(max_workers, total))
    workers: list[_Worker] = []
    next_index = 0
    completed = 0
    clean_exit = False

    def complete(path: str, result: Any = None, failure: Optional[FileFailure] = None) -> None:
        nonlocal completed
        completed += 1
        if failure is None and isinstance(result, dict) and "error" in result:
            failure = FileFailure(path, "error", str(result.get("error")))
        if failure is not None:
            outcome.failures.append(failure)
        else:
            outcome.results.append(result)
        if on_file_done is not None:
            on_file_done(completed, total, path, failure)

    def replace(worker: _Worker) -> _Worker:
        worker.kill()
        fresh = _Worker(ctx, analyze_fn)
        workers[workers.index(worker)] = fresh
        return fresh

    try:
        for _ in range(worker_count):
            if cancel is not None:
                cancel.raise_if_cancelled()
            workers.append(_Worker(ctx, analyze_fn))

        while completed < total:
            if cancel is not None:
                cancel.raise_if_cancelled()

            for worker in list(workers):
                if worker.busy or next_index >= total:
                    continue
                if worker.tasks_done >= max_tasks_per_worker or not worker.proc.is_alive():
                    worker = replace(worker)
                path = files[next_index]
                next_index += 1
                if on_file_start is not None:
                    on_file_start(next_index, total, path)
                try:
                    worker.assign(path)
                except (BrokenPipeError, OSError) as exc:
                    complete(path, failure=FileFailure(path, "crash", f"worker unavailable: {exc}"))
                    replace(worker)

            busy = [w for w in workers if w.busy]
            if not busy:
                continue

            ready = set(
                wait_for_ready(
                    [w.conn for w in busy] + [w.proc.sentinel for w in busy],
                    timeout=poll_interval,
                )
            )

            now = time.monotonic()
            for worker in busy:
                path = worker.path
                assert path is not None
                if worker.conn in ready:
                    try:
                        result = worker.conn.recv()
                    except (EOFError, OSError) as exc:
                        complete(path, failure=FileFailure(path, "crash", f"worker exited: {exc!r}"))
                        replace(worker)
                        continue
                    worker.finish()
                    complete(path, result)
                elif worker.proc.sentinel in ready:
                    complete(
                        path,
                        failure=FileFailure(path, "crash", f"worker exited with code {worker.proc.exitcode}"),
                    )
                    replace(worker)
                elif now - worker.started_at > timeout_seconds:
                    complete(
                        path,
                        failure=FileFailure(path, "timeout", f"exceeded {timeout_seconds:g}s"),
                    )
                    replace(worker)
        clean_exit = True
    finally:
        for worker in workers:
            worker.stop(graceful=clean_exit)

    return outcome


_active_lock = threading.Lock()
_active_tokens: set[CancelToken] = set()


@contextmanager
def track_scan(token: CancelToken) -> Iterator[CancelToken]:
    """Register ``token`` so ``cancel_all_scans`` can reach it while the scan runs."""
    with _active_lock:
        _active_tokens.add(token)
    try:
        yield token
    finally:
        with _active_lock:
            _active_tokens.discard(token)


def cancel_all_scans() -> int:
    """Cancel every in-flight scan in this process. Returns how many were signalled."""
    with _active_lock:
        tokens = list(_active_tokens)
    for token in tokens:
        token.cancel()
    return len(tokens)
