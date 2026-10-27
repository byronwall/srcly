"""
Python owns the data-flow engine: one lazy Node child per scan root.

``EngineProcess`` speaks the engine's stdio protocol (``engine/src/srcly/protocol.ts``):
one JSON request per stdin line, one reply per stdout line, progress frames
in between. A reader thread matches replies to waiting callers by id, so
callers on different threads can share one child. ``EngineRegistry`` keeps at
most a couple of children alive and closes idle ones.
"""

from __future__ import annotations

import collections
import json
import os
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.services.cache import cache_dir
from app.services.dataflow import availability
from app.services.dataflow.availability import Availability, Launch

PROTOCOL_VERSION = 1
TIMEOUT_ENV = "SRCLY_DATAFLOW_TIMEOUT"

HELLO_TIMEOUT = 10.0
QUERY_TIMEOUT = 30.0
# The background build of tier 1: the engine's main thread stays free for
# `status` while it runs, and a Python app's mypy pass takes minutes on a
# large project. Matches the helper's own limit in engine/src/srcly/python/run.ts.
BUILD_TIMEOUT = 600.0
CANCEL_GRACE = 2.0
STDERR_LINES = 64


class EngineError(Exception):
    """A request that did not produce a result. ``code`` is the engine's error code or one of ours."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


class EngineCrashed(EngineError):
    def __init__(self, message: str, stderr_tail: list[str]):
        super().__init__("engine-crashed", message, {"stderr": stderr_tail})
        self.stderr_tail = stderr_tail


class EngineTimeout(EngineError):
    def __init__(self, op: str, timeout: float):
        super().__init__("timed-out", f"The engine did not answer {op} within {timeout:g} s.")


def timeout_override() -> float | None:
    raw = os.environ.get(TIMEOUT_ENV)
    try:
        return float(raw) if raw else None
    except ValueError:
        return None


@dataclass
class _Pending:
    op: str
    done: threading.Event = field(default_factory=threading.Event)
    reply: dict | None = None
    on_progress: Callable[[dict], None] | None = None


class EngineProcess:
    """One engine child for one root. Thread-safe: any thread may call ``request``."""

    def __init__(
        self,
        root: Path,
        source: Path,
        tsconfig: str | None,
        *,
        launch: Launch,
        env: dict[str, str] | None = None,
        language: str = "typescript",
        python: str | None = None,
    ):
        self.root = root
        self.language = language
        self.python = python
        self.source = source
        self.tsconfig = tsconfig
        self.launch = launch
        self._env = env
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._pending: dict[int, _Pending] = {}
        self._next_id = 1
        self.stderr_tail: collections.deque[str] = collections.deque(maxlen=STDERR_LINES)
        self.latest_progress: dict | None = None
        self.hello: dict | None = None
        self.crashed: EngineCrashed | None = None
        self.last_used = time.monotonic()
        self.queries = 0

    # ---- lifecycle -------------------------------------------------------

    def start(self) -> None:
        argv = [*self.launch.argv, "--root", str(self.root), "--source", str(self.source)]
        if self.tsconfig:
            argv += ["--tsconfig", self.tsconfig]
        argv += ["--language", self.language]
        if self.python:
            argv += ["--python", self.python]
        env = {**os.environ, **(self._env or {}), "NO_COLOR": "1", "FORCE_COLOR": "0"}
        self._proc = subprocess.Popen(
            argv,
            cwd=str(self.launch.cwd),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        threading.Thread(target=self._read_stdout, name=f"engine-stdout-{self._proc.pid}", daemon=True).start()
        threading.Thread(target=self._read_stderr, name=f"engine-stderr-{self._proc.pid}", daemon=True).start()

    def handshake(self, timeout: float = HELLO_TIMEOUT) -> dict:
        hello = self.request("hello", {"protocol": PROTOCOL_VERSION, "root": str(self.root), "source": str(self.source)}, timeout=timeout)
        if hello.get("protocol") != PROTOCOL_VERSION:
            self.close()
            raise EngineError(
                "engine-protocol-mismatch",
                f"The engine speaks protocol {hello.get('protocol')}; this server speaks {PROTOCOL_VERSION}.",
            )
        self.hello = hello
        return hello

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self._proc else None

    @property
    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None and self.crashed is None

    @property
    def busy(self) -> bool:
        with self._lock:
            return bool(self._pending)

    def close(self, grace: float = CANCEL_GRACE) -> None:
        """Close stdin (the engine exits on EOF), then kill the group if it lingers."""
        proc = self._proc
        if proc is None:
            return
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            self._kill()
        self._fail_all(EngineError("cancelled", "The engine was closed."))

    def cancel_all(self) -> None:
        """Ask the engine to cancel every in-flight request and release their callers."""
        with self._lock:
            ids = list(self._pending)
        for request_id in ids:
            self.cancel(request_id)
        self._fail_all(EngineError("cancelled", "Cancelled because the server is shutting down."))

    def _kill(self) -> None:
        proc = self._proc
        if proc is None:
            return
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                proc.kill()
            except OSError:
                pass
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass

    # ---- requests --------------------------------------------------------

    def request(
        self,
        op: str,
        params: dict | None = None,
        *,
        timeout: float = QUERY_TIMEOUT,
        expected_generation: int | None = None,
        on_progress: Callable[[dict], None] | None = None,
    ) -> dict:
        """Send one request and wait for its reply. Raises ``EngineError`` (or a subclass) on failure."""
        if self.crashed is not None:
            raise self.crashed
        if self._proc is None or self._proc.poll() is not None:
            raise self._crash("The engine is not running.")
        payload = dict(params or {})
        if expected_generation is not None:
            payload["expectedGeneration"] = expected_generation
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            pending = _Pending(op=op, on_progress=on_progress)
            self._pending[request_id] = pending
        self.last_used = time.monotonic()
        # Status polls and the handshake are not queries: the first real one still builds tier 1.
        if op not in ("status", "hello"):
            self.queries += 1
        if not self._write({"id": request_id, "op": op, "params": payload}):
            with self._lock:
                self._pending.pop(request_id, None)
            raise self._crash("The engine closed its input.")

        override = timeout_override()
        effective = override if override is not None else timeout
        if not pending.done.wait(effective):
            return self._timed_out(request_id, pending, effective)
        self.last_used = time.monotonic()
        return self._result(pending)

    def cancel(self, request_id: int) -> None:
        self._write({"op": "cancel", "params": {"id": request_id}})

    def _timed_out(self, request_id: int, pending: _Pending, timeout: float) -> dict:
        # Ask for a cancel; a child that does not answer it is killed.
        self.cancel(request_id)
        if pending.done.wait(CANCEL_GRACE):
            with self._lock:
                self._pending.pop(request_id, None)
            raise EngineTimeout(pending.op, timeout)
        with self._lock:
            self._pending.pop(request_id, None)
        # Record the reason before the kill, so the reader thread's exit notice does not replace it.
        crash = self._crash(f"The engine did not answer {pending.op} or its cancel; it was stopped.")
        crash.code = "timed-out"
        self._kill()
        raise crash

    @staticmethod
    def _result(pending: _Pending) -> dict:
        reply = pending.reply or {}
        if reply.get("ok") is True:
            result = reply.get("result")
            return result if isinstance(result, dict) else {"value": result}
        if "crashed" in reply:
            raise reply["crashed"]
        error = reply.get("error") or {}
        raise EngineError(
            str(error.get("code") or "internal"),
            str(error.get("message") or "The engine reported an error."),
            error.get("details") if isinstance(error.get("details"), dict) else None,
        )

    def _write(self, frame: dict) -> bool:
        proc = self._proc
        if proc is None or proc.stdin is None:
            return False
        line = (json.dumps(frame, separators=(",", ":")) + "\n").encode("utf-8")
        with self._write_lock:
            try:
                proc.stdin.write(line)
                proc.stdin.flush()
                return True
            except (BrokenPipeError, OSError, ValueError):
                return False

    # ---- reader threads --------------------------------------------------

    def _read_stdout(self) -> None:
        proc = self._proc
        assert proc is not None and proc.stdout is not None
        for raw in proc.stdout:
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                # A stray stdout line means the channel is corrupt: stop trusting it.
                self.stderr_tail.append(f"[non-protocol stdout] {line[:500]}")
                self._kill()
                self._crash("The engine wrote a line that is not a protocol frame.")
                return
            self._dispatch(frame)
        proc.wait()
        if self.crashed is None:
            self._crash(f"The engine exited with code {proc.returncode}.")

    def _read_stderr(self) -> None:
        proc = self._proc
        assert proc is not None and proc.stderr is not None
        for raw in proc.stderr:
            self.stderr_tail.append(raw.decode("utf-8", "replace").rstrip())

    def _dispatch(self, frame: Any) -> None:
        if not isinstance(frame, dict):
            return
        request_id = frame.get("id")
        if "progress" in frame:
            progress = frame.get("progress")
            if isinstance(progress, dict):
                self.latest_progress = progress
                with self._lock:
                    pending = self._pending.get(request_id)
                if pending and pending.on_progress:
                    pending.on_progress(progress)
            return
        with self._lock:
            # A reply for a request we already gave up on (timeout) is dropped here.
            pending = self._pending.pop(request_id, None)
            if not self._pending:
                self.latest_progress = None
        if pending is None:
            return
        pending.reply = frame
        pending.done.set()

    def _crash(self, message: str) -> EngineCrashed:
        if self.crashed is None:
            self.crashed = EngineCrashed(message, list(self.stderr_tail))
        self._fail_all(None)
        return self.crashed

    def _fail_all(self, error: EngineError | None) -> None:
        with self._lock:
            waiting = list(self._pending.values())
            self._pending.clear()
            self.latest_progress = None
        for pending in waiting:
            pending.reply = {"crashed": error or self.crashed or EngineError("internal", "The engine stopped.")}
            pending.done.set()


LaunchProbe = Callable[[Path], Availability]


class EngineRegistry:
    """
    One engine per resolved root, started on first explicit use. At most
    ``cap`` children live at once (each holds a TypeScript Program, 1–2 GB
    on a real app, bounded by the engine's ``SRCLY_DATAFLOW_MEMORY_MB``);
    starting another closes the least recently used, and a child idle for
    ``idle_seconds`` is closed by a timer or the next registry call.
    """

    def __init__(
        self,
        *,
        cap: int = 2,
        idle_seconds: float = 15 * 60,
        probe: LaunchProbe = availability.probe,
        env: dict[str, str] | None = None,
    ):
        self.cap = cap
        self.idle_seconds = idle_seconds
        self._probe = probe
        # The engine's result cache lives beside the analysis cache; a changed Program hash misses it.
        self._env = {"SRCLY_DATAFLOW_CACHE_DIR": str(cache_dir().parent / "dataflow"), **(env or {})}
        self._lock = threading.RLock()
        self._engines: dict[Path, EngineProcess] = {}
        # A root whose engine crashed stays N/A until an explicit start.
        self._failed: dict[Path, EngineError] = {}
        # Roots whose background start (tier 1) is still running.
        self._warming: dict[Path, threading.Thread] = {}
        # Closes idle children while any are alive (``_start_reaper``).
        self._reaper: threading.Thread | None = None

    @staticmethod
    def key(root: Path) -> Path:
        return root.resolve()

    def probe(self, root: Path) -> Availability:
        return self._probe(self.key(root))

    def get(self, root: Path) -> EngineProcess | None:
        with self._lock:
            self._reap_idle()
            engine = self._engines.get(self.key(root))
            return engine if engine and engine.alive else None

    def failure(self, root: Path) -> EngineError | None:
        with self._lock:
            return self._failed.get(self.key(root))

    def warming(self, root: Path) -> bool:
        with self._lock:
            thread = self._warming.get(self.key(root))
            return thread is not None and thread.is_alive()

    def ensure(self, root: Path, *, retry: bool = False) -> EngineProcess:
        """The live engine for ``root``, starting it (and handshaking) when needed."""
        key = self.key(root)
        with self._lock:
            self._reap_idle()
            if retry:
                self._failed.pop(key, None)
            failed = self._failed.get(key)
            if failed is not None:
                raise failed
            engine = self._engines.get(key)
            if engine and engine.alive:
                return engine
            if engine:
                self._engines.pop(key, None)
            found = self._probe(key)
            if not found.available or found.launch is None:
                raise EngineError(found.reason or "engine-missing", found.message or "The data-flow engine is unavailable.")
            self._make_room()
            engine = EngineProcess(
                key,
                availability.default_source(key),
                None,
                launch=found.launch,
                env=self._env,
                language=found.language,
                python=found.python,
            )
            try:
                engine.start()
            except OSError as exc:
                raise EngineError("engine-missing", f"Could not start the engine: {exc.strerror or exc}") from exc
            self._engines[key] = engine
            self._start_reaper()
        try:
            engine.handshake()
        except EngineError as exc:
            self._record_failure(key, engine, exc)
            raise
        return engine

    def query(self, root: Path, op: str, params: dict | None = None, *, expected_generation: int | None = None, timeout: float | None = None) -> dict:
        """Run one op on the root's engine, recording a crash so later calls report it."""
        engine = self.ensure(root)
        if timeout is None:
            # The first query builds tier 1, which scales with the project.
            timeout = QUERY_TIMEOUT if engine.queries > 0 else max(60.0, 0.25 * availability.count_source_files(engine.root, language=engine.language))
        try:
            return engine.request(op, params, timeout=timeout, expected_generation=expected_generation)
        except EngineCrashed as exc:
            self._record_failure(self.key(root), engine, exc)
            raise

    def start_background(self, root: Path) -> None:
        """Start the engine and build tier 1 on a thread; ``status`` shows its progress."""
        key = self.key(root)
        with self._lock:
            if self.warming(key):
                return
            self._failed.pop(key, None)

            def warm() -> None:
                try:
                    self.query(key, "routes", timeout=BUILD_TIMEOUT)
                except EngineError as exc:
                    if exc.code not in ("cancelled",):
                        with self._lock:
                            self._failed.setdefault(key, exc)

            thread = threading.Thread(target=warm, name=f"dataflow-start-{key.name}", daemon=True)
            self._warming[key] = thread
            thread.start()

    def close(self, root: Path) -> bool:
        key = self.key(root)
        with self._lock:
            engine = self._engines.pop(key, None)
            self._failed.pop(key, None)
        if engine is None:
            return False
        engine.close()
        return True

    def cancel_all(self) -> None:
        with self._lock:
            engines = list(self._engines.values())
        for engine in engines:
            engine.cancel_all()

    def close_all(self) -> None:
        with self._lock:
            engines = list(self._engines.values())
            self._engines.clear()
            self._failed.clear()
        for engine in engines:
            engine.close()

    def live_count(self) -> int:
        with self._lock:
            return sum(1 for engine in self._engines.values() if engine.alive)

    def _record_failure(self, key: Path, engine: EngineProcess, exc: EngineError) -> None:
        with self._lock:
            if exc.code in ("engine-crashed", "timed-out", "engine-protocol-mismatch"):
                self._failed[key] = exc
                if self._engines.get(key) is engine:
                    self._engines.pop(key, None)

    def _make_room(self) -> None:
        live = [(engine.last_used, key) for key, engine in self._engines.items() if engine.alive]
        while len(live) >= self.cap:
            live.sort()
            _, oldest = live.pop(0)
            engine = self._engines.pop(oldest)
            threading.Thread(target=engine.close, daemon=True).start()

    def _start_reaper(self) -> None:
        """
        Close idle children on a timer as well as on the next registry call,
        so an engine nobody queries again still gives its memory back. The
        thread ends when no child is left; the next start begins another.
        """
        if self._reaper is not None and self._reaper.is_alive():
            return

        def reap() -> None:
            while True:
                time.sleep(min(60.0, max(self.idle_seconds / 4, 0.05)))
                with self._lock:
                    self._reap_idle()
                    if not self._engines:
                        self._reaper = None
                        return

        self._reaper = threading.Thread(target=reap, name="dataflow-reaper", daemon=True)
        self._reaper.start()

    def _reap_idle(self) -> None:
        now = time.monotonic()
        for key, engine in list(self._engines.items()):
            if not engine.alive:
                self._engines.pop(key, None)
            elif not engine.busy and now - engine.last_used > self.idle_seconds:
                self._engines.pop(key, None)
                threading.Thread(target=engine.close, daemon=True).start()


registry = EngineRegistry()
