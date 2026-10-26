"""The compact tree encoding (scan_jobs.compact_tree) and its client counterpart."""

import gzip
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import Metrics, Node, Witness
from app.services import scan_jobs

NORMALIZE_TS = Path(__file__).resolve().parents[2] / "client/src/utils/normalizeTree.ts"


def _client_block(name: str) -> dict:
    source = NORMALIZE_TS.read_text()
    block = re.search(rf"export const {name} = \{{(.*?)\}} as const", source, re.S)
    assert block, f"{name} not found in normalizeTree.ts"
    return {key: json.loads(value) for key, value in re.findall(r"^\s*(\w+):\s*([^,\n]+),", block.group(1), re.M)}


def test_client_default_metrics_match_server_model() -> None:
    client = _client_block("DEFAULT_METRICS")
    server = {name: field.default for name, field in Metrics.model_fields.items()}
    assert list(client) == list(server)
    for name, default in server.items():
        assert client[name] == default and (client[name] is None) == (default is None), name
    assert scan_jobs.METRIC_DEFAULTS == server


def test_client_default_node_matches_server_model() -> None:
    client = _client_block("DEFAULT_NODE")
    server = dict(scan_jobs.NODE_DEFAULTS)
    assert server.pop("children") == []
    assert client == server
    # Every other Node field is required, so the server always sends it.
    required = {name for name, field in Node.model_fields.items() if field.is_required()}
    assert required | set(scan_jobs.NODE_DEFAULTS) == set(Node.model_fields)


def _node(name: str, type_: str, path: str, children=(), **fields) -> Node:
    metrics = fields.pop("metrics", Metrics())
    return Node(name=name, type=type_, path=path, metrics=metrics, children=list(children), **fields)


def _sample_tree() -> Node:
    witness = Witness(path="/r/src/a.ts::run", name="run", start_line=2, end_line=9)
    fn_body = _node("(body)", "function_body", "/r/src/a.ts::run::(body)")
    fn = _node(
        "run", "function", "/r/src/a.ts::run", [fn_body], kind="function", start_line=2, end_line=9,
        metrics=Metrics(complexity=0, function_count=1, na_reason="Not TSX"),
    )
    odd = _node("weird", "function", "/elsewhere/weird", kind="class")
    file = _node(
        "a.ts", "file", "/r/src/a.ts", [fn, odd],
        metrics=Metrics(loc=10, complexity=2.5, complexity_witness=witness, todo_count=0, na_reasons={"x": "y"}),
    )
    windows = _node("b.py", "file", "/r/src\\b.py", metrics=Metrics(analysis_status="timeout", last_modified=12.5))
    src = _node("src", "folder", "/r/src", [file, windows])
    return _node("root", "folder", "/r", [src])


def test_compact_tree_drops_defaults_and_derivable_paths_only() -> None:
    tree = _sample_tree()
    full = json.loads(scan_jobs.serialize_tree(tree))
    raw = scan_jobs.compact_tree(json.loads(scan_jobs.serialize_tree(tree)))

    src_raw = raw["children"][0]
    file_raw = src_raw["children"][0]
    fn_raw = file_raw["children"][0]
    assert raw["path"] == "/r"
    assert "path" not in src_raw and "path" not in file_raw and "path" not in fn_raw
    assert "path" not in fn_raw["children"][0]
    # Paths that don't follow the parent + separator + name rule are kept.
    assert file_raw["children"][1]["path"] == "/elsewhere/weird"
    assert src_raw["children"][1]["path"] == "/r/src\\b.py"
    # A measured 0 is not N/A, so it is sent; N/A (the default) is not.
    assert fn_raw["metrics"] == {"complexity": 0, "function_count": 1, "na_reason": "Not TSX"}
    assert file_raw["metrics"]["todo_count"] == 0
    assert "children" not in fn_raw["children"][0] and "kind" not in src_raw
    assert raw["metrics"] == {}

    assert scan_jobs.expand_tree(raw) == full
    assert Node.model_validate(raw) == tree


def test_overlaid_result_is_compact_and_round_trips(tmp_path: Path) -> None:
    child = _node("a.py", "file", str(tmp_path / "a.py"), metrics=Metrics(loc=3))
    job = scan_jobs.ScanJob(root_path=tmp_path, phase="complete")
    job.result = _node("root", "folder", str(tmp_path), [child])

    raw = json.loads(job.result_json_overlaid())
    assert raw["children"][0]["name"] == "a.py" and "path" not in raw["children"][0]
    # The overlays' own fields survive: N/A activity and findings with reasons.
    assert raw["activity"]["status"] == "na" and raw["findings"]["status"] == "na"
    expanded = Node.model_validate(scan_jobs.expand_tree(raw))
    assert expanded.children[0].path == str(tmp_path / "a.py")
    assert expanded.children[0].metrics.loc == 3
    # The cached full tree is untouched.
    assert json.loads(job.result_json())["children"][0]["path"] == str(tmp_path / "a.py")


def test_result_routes_gzip_when_accepted(monkeypatch, tmp_path: Path) -> None:
    job = scan_jobs.ScanJob(root_path=tmp_path, phase="complete")
    job.result = _node("root", "folder", str(tmp_path), [_node("a.py", "file", str(tmp_path / "a.py"), metrics=Metrics(loc=1))])
    monkeypatch.setattr(scan_jobs.manager, "get", lambda job_id: job if job_id == job.id else None)

    client = TestClient(app)
    zipped = client.get(f"/api/scans/{job.id}/result")
    plain = client.get(f"/api/scans/{job.id}/result", headers={"Accept-Encoding": "identity"})

    assert zipped.headers["content-encoding"] == "gzip"
    assert "content-encoding" not in plain.headers
    # httpx decompresses transparently, so both bodies are the same JSON.
    assert zipped.content == plain.content == job.result_json_overlaid()
    assert gzip.decompress(job.result_gzip_overlaid()) == job.result_json_overlaid()
    # Compressed once per overlay.
    assert job.result_gzip_overlaid() is job.result_gzip_overlaid()
