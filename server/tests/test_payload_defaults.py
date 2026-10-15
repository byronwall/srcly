"""The compact tree encoding (scan_jobs.serialize_tree) and its client counterpart."""

import gzip
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import Metrics, Node
from app.services import scan_jobs

NORMALIZE_TS = Path(__file__).resolve().parents[2] / "client/src/utils/normalizeTree.ts"


def test_client_default_metrics_match_server_model() -> None:
    source = NORMALIZE_TS.read_text()
    block = re.search(r"DEFAULT_METRICS = \{(.*?)\} as const", source, re.S)
    assert block, "DEFAULT_METRICS not found in normalizeTree.ts"
    client = dict(re.findall(r"^\s*(\w+):\s*([^,\n]+),", block.group(1), re.M))

    server = {name: field.default for name, field in Metrics.model_fields.items()}
    assert set(client) == set(server)
    for name, default in server.items():
        expected = f'"{default}"' if isinstance(default, str) else str(default).removesuffix(".0")
        assert client[name] == expected, name


def _node(name: str, type_: str, path: str, children=(), **metrics) -> Node:
    return Node(name=name, type=type_, path=path, metrics=Metrics(**metrics), children=list(children))


def test_serialize_tree_drops_derivable_paths_only() -> None:
    fn_body = _node("(body)", "function_body", "/r/src/a.ts::run::(body)")
    fn = _node("run", "function", "/r/src/a.ts::run", [fn_body], complexity=2.5)
    odd = _node("weird", "function", "/elsewhere/weird")
    file = _node("a.ts", "file", "/r/src/a.ts", [fn, odd], loc=10)
    windows = _node("b.py", "file", "/r/src\\b.py")
    src = _node("src", "folder", "/r/src", [file, windows])
    root = _node("root", "folder", "/r", [src])

    encoded = scan_jobs.serialize_tree(root)
    raw = json.loads(encoded)

    src_raw = raw["children"][0]
    file_raw = src_raw["children"][0]
    assert raw["path"] == "/r"
    assert "path" not in src_raw
    assert "path" not in file_raw
    assert "path" not in file_raw["children"][0]
    assert "path" not in file_raw["children"][0]["children"][0]
    # Paths that don't follow the parent + separator + name rule are kept.
    assert file_raw["children"][1]["path"] == "/elsewhere/weird"
    assert src_raw["children"][1]["path"] == "/r/src\\b.py"
    assert scan_jobs.expand_tree(encoded) == root


def test_tree_response_gzips_when_accepted(monkeypatch, tmp_path: Path) -> None:
    job = scan_jobs.ScanJob(root_path=tmp_path, phase="complete")
    job.result = _node("root", "folder", str(tmp_path), [_node("a.py", "file", str(tmp_path / "a.py"), loc=1)])
    monkeypatch.setattr(scan_jobs.manager, "get", lambda job_id: job if job_id == job.id else None)

    client = TestClient(app)
    zipped = client.get(f"/api/scans/{job.id}/result")
    plain = client.get(f"/api/scans/{job.id}/result", headers={"Accept-Encoding": "identity"})

    assert zipped.headers["content-encoding"] == "gzip"
    assert "content-encoding" not in plain.headers
    # httpx decompresses transparently, so both bodies are the same JSON.
    assert zipped.content == plain.content == job.result_json()
    assert gzip.decompress(job.result_gzip()) == job.result_json()
