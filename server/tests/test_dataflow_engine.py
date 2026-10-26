"""Engine child lifecycle against tests/fake_engine.py (no Node needed)."""

import sys
import threading
import time
from pathlib import Path

import pytest

from app.services.dataflow.availability import Availability, Launch
from app.services.dataflow.engine import EngineCrashed, EngineError, EngineProcess, EngineRegistry, EngineTimeout

FAKE = Path(__file__).with_name("fake_engine.py")


def launch(*flags: str) -> Launch:
    return Launch((sys.executable, str(FAKE), *flags), FAKE.parent, "test")


def process(tmp_path: Path, *flags: str) -> EngineProcess:
    engine = EngineProcess(tmp_path, tmp_path / "src", None, launch=launch(*flags))
    engine.start()
    return engine


def test_handshake_reports_the_engine(tmp_path):
    engine = process(tmp_path)
    hello = engine.handshake()
    assert hello["protocol"] == 1 and hello["root"] == str(tmp_path)
    engine.close()
    assert not engine.alive


def test_registry_gives_the_engine_a_result_cache_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("SRCLY_CACHE_DIR", str(tmp_path))
    registry = EngineRegistry()
    assert registry._env["SRCLY_DATAFLOW_CACHE_DIR"] == str(tmp_path / "dataflow")
    # A caller's own environment wins over the default.
    assert EngineRegistry(env={"SRCLY_DATAFLOW_CACHE_DIR": "/elsewhere"})._env["SRCLY_DATAFLOW_CACHE_DIR"] == "/elsewhere"


def test_protocol_mismatch_is_refused(tmp_path):
    engine = process(tmp_path, "--protocol", "2")
    with pytest.raises(EngineError) as info:
        engine.handshake()
    assert info.value.code == "engine-protocol-mismatch"


def test_replies_match_requests_out_of_order(tmp_path):
    engine = process(tmp_path, "--delay", "routes=0.4")
    engine.handshake()
    results: dict[str, dict] = {}
    slow = threading.Thread(target=lambda: results.__setitem__("routes", engine.request("routes", timeout=5)))
    slow.start()
    time.sleep(0.05)
    started = time.monotonic()
    results["status"] = engine.request("status", timeout=5)
    assert time.monotonic() - started < 0.3, "status waited behind the slow routes reply"
    slow.join()
    assert results["routes"]["routes"][0]["pathPattern"] == "/records"
    assert "built" in results["status"]
    engine.close()


def test_progress_frames_reach_the_caller_and_latest_progress(tmp_path):
    engine = process(tmp_path, "--delay", "routes=0.3")
    engine.handshake()
    seen: list[dict] = []
    thread = threading.Thread(target=lambda: engine.request("routes", timeout=5, on_progress=seen.append))
    thread.start()
    time.sleep(0.15)
    assert engine.latest_progress == {"phase": "program", "message": "Building", "completed": 0, "total": 3}
    thread.join()
    assert seen and seen[0]["phase"] == "program"
    assert engine.latest_progress is None
    engine.close()


def test_timeout_cancels_and_drops_the_late_reply(tmp_path):
    # The fake ignores the cancel but answers within the grace period: a timeout, not a kill.
    engine = process(tmp_path, "--delay", "routes=0.5", "--ignore-cancel")
    engine.handshake()
    with pytest.raises(EngineTimeout):
        engine.request("routes", timeout=0.1)
    assert engine.alive
    assert engine.request("status", timeout=5)["protocol"] == 1
    engine.close()


def test_cancelled_reply_after_timeout(tmp_path):
    engine = process(tmp_path, "--hang", "routes")
    engine.handshake()
    with pytest.raises(EngineTimeout):
        engine.request("routes", timeout=0.1)
    assert engine.alive
    engine.close()


def test_unanswered_cancel_kills_the_child(tmp_path):
    engine = process(tmp_path, "--hang", "routes", "--ignore-cancel")
    engine.handshake()
    started = time.monotonic()
    with pytest.raises(EngineCrashed) as info:
        engine.request("routes", timeout=0.1)
    assert info.value.code == "timed-out"
    assert time.monotonic() - started < 5
    assert not engine.alive


def test_crash_reports_engine_crashed_with_stderr(tmp_path):
    engine = process(tmp_path, "--crash", "routes")
    engine.handshake()
    with pytest.raises(EngineCrashed) as info:
        engine.request("routes", timeout=5)
    assert info.value.code == "engine-crashed"
    assert any("fake engine crashed on routes" in line for line in info.value.stderr_tail)
    with pytest.raises(EngineCrashed):
        engine.request("status", timeout=1)


def test_a_non_protocol_stdout_line_is_a_crash(tmp_path):
    engine = process(tmp_path, "--garbage", "routes")
    engine.handshake()
    with pytest.raises(EngineCrashed) as info:
        engine.request("routes", timeout=5)
    assert any("not a frame" in line for line in info.value.stderr_tail)


def test_engine_error_codes_come_through(tmp_path):
    engine = process(tmp_path, "--refuse", "non-strict-tsconfig")
    engine.handshake()
    with pytest.raises(EngineError) as info:
        engine.request("routes", timeout=5)
    assert info.value.code == "non-strict-tsconfig"
    engine.close()


def test_eof_makes_the_child_exit(tmp_path):
    engine = process(tmp_path)
    engine.handshake()
    proc = engine._proc
    proc.stdin.close()
    assert proc.wait(timeout=5) == 0


def _registry(tmp_path: Path, *flags: str, **kwargs) -> EngineRegistry:
    return EngineRegistry(probe=lambda root: Availability(True, node=sys.executable, launch=launch(*flags)), **kwargs)


def test_registry_caps_live_children(tmp_path):
    roots = []
    for name in ("a", "b", "c"):
        (tmp_path / name).mkdir()
        roots.append(tmp_path / name)
    registry = _registry(tmp_path, cap=2)
    first = registry.ensure(roots[0])
    registry.ensure(roots[1])
    registry.ensure(roots[2])
    time.sleep(0.5)
    assert registry.live_count() == 2
    assert registry.get(roots[0]) is None and not first.alive
    registry.close_all()
    assert registry.live_count() == 0


def test_registry_closes_idle_children(tmp_path):
    registry = _registry(tmp_path, idle_seconds=0.1)
    engine = registry.ensure(tmp_path)
    time.sleep(0.2)
    assert registry.get(tmp_path) is None
    time.sleep(0.5)
    assert not engine.alive


def test_registry_closes_idle_children_without_another_call(tmp_path):
    # An engine nobody asks about again still gives its memory back.
    registry = _registry(tmp_path, idle_seconds=0.1)
    engine = registry.ensure(tmp_path)
    deadline = time.monotonic() + 5
    while engine.alive and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not engine.alive


def test_registry_remembers_a_crash_until_retry(tmp_path):
    registry = _registry(tmp_path, "--crash", "routes")
    with pytest.raises(EngineCrashed):
        registry.query(tmp_path, "routes")
    assert registry.failure(tmp_path).code == "engine-crashed"
    with pytest.raises(EngineCrashed):
        registry.ensure(tmp_path)
    assert registry.ensure(tmp_path, retry=True).alive
    registry.close_all()


def test_cancel_all_releases_waiting_callers(tmp_path):
    registry = _registry(tmp_path, "--hang", "routes", "--ignore-cancel")
    errors: list[EngineError] = []

    def wait() -> None:
        try:
            registry.query(tmp_path, "routes", timeout=30)
        except EngineError as exc:
            errors.append(exc)

    thread = threading.Thread(target=wait)
    thread.start()
    time.sleep(0.3)
    registry.cancel_all()
    thread.join(timeout=5)
    assert not thread.is_alive()
    assert errors and errors[0].code == "cancelled"
    registry.close_all()


def test_lifespan_closes_every_engine(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.dataflow import engine as dataflow_engine

    registry = _registry(tmp_path)
    monkeypatch.setattr(dataflow_engine, "registry", registry)
    with TestClient(app):
        engine = registry.ensure(tmp_path)
        assert engine.alive
    assert not engine.alive
