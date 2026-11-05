from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.ts").write_text("export function a() { b(); }\nexport function b() {}\n", encoding="utf-8")
    (tmp_path / "src" / "a.test.ts").write_text('import { a } from "./a";\na();\n', encoding="utf-8")
    return tmp_path


def test_graph_answers_a_neighbourhood_with_camel_case_fields(client, repo):
    res = client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#b"})
    assert res.status_code == 200
    body = res.json()
    assert body["focus"] == "src/a.ts#b"
    assert {n["id"] for n in body["nodes"]} == {"src/a.ts#a", "src/a.ts#b"}
    focus = next(n for n in body["nodes"] if n["id"] == "src/a.ts#b")
    assert focus["inCount"] == 1 and focus["outCount"] == 0 and focus["hop"] == 0 and "endLine" in focus
    assert body["edges"] == [{"source": "src/a.ts#a", "target": "src/a.ts#b", "kind": "call", "lines": [1], "count": 1, "resolution": "exact"}]
    assert body["index"]["files"] == 2 and "builtMs" in body["index"]


def test_graph_hides_tests_on_request(client, repo):
    with_tests = client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#a"}).json()
    assert "src/a.test.ts" in {n["id"] for n in with_tests["nodes"]}
    assert next(n for n in with_tests["nodes"] if n["id"] == "src/a.test.ts")["isTest"] is True
    without = client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#a", "tests": "false"}).json()
    assert "src/a.test.ts" not in {n["id"] for n in without["nodes"]}


def test_graph_rejects_unknown_symbols_kinds_and_paths(client, repo):
    assert client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#zzz"}).status_code == 404
    assert client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#a", "kinds": "bogus"}).status_code == 400
    assert client.get("/api/symbols/graph", params={"path": str(repo / "nope"), "at": "x"}).status_code == 404
    assert client.get("/api/symbols/graph", params={"path": str(repo), "at": "src/a.ts#a", "hops": 9}).status_code == 422


def test_search(client, repo):
    body = client.get("/api/symbols/search", params={"path": str(repo), "q": "a"}).json()
    assert body["hits"][0]["id"] == "src/a.ts#a" and body["hits"][0]["inCount"] == 1
    assert body["index"]["symbols"] == 2


def test_graph_draws_members_and_opens_hops_on_request(client, tmp_path: Path):
    (tmp_path / "s.ts").write_text("export class S { m() {} }\nexport function a() { new S().m(); }\nexport function b() { a(); }\n", encoding="utf-8")
    body = client.get("/api/symbols/graph", params={"path": str(tmp_path), "at": "s.ts#S"}).json()
    hops = {n["id"]: n["hop"] for n in body["nodes"]}
    assert hops == {"s.ts#S": 0, "s.ts#S.m": 0, "s.ts#a": 1}
    opened = client.get("/api/symbols/graph", params={"path": str(tmp_path), "at": "s.ts#S", "more": "s.ts#a"}).json()
    assert "s.ts#b" in {n["id"] for n in opened["nodes"]}
    bare = client.get("/api/symbols/graph", params={"path": str(tmp_path), "at": "s.ts#S", "members": "false"}).json()
    assert {n["id"] for n in bare["nodes"]} == {"s.ts#S", "s.ts#a"}


def test_path(client, repo):
    body = client.get("/api/symbols/path", params={"path": str(repo), "from": "src/a.ts#a", "to": "src/a.ts#b"}).json()
    assert body["found"] and body["direction"] == "forward" and body["steps"] == 1
    assert [n["id"] for n in body["nodes"]] == ["src/a.ts#a", "src/a.ts#b"] and body["edges"][0]["lines"] == [1]
    assert client.get("/api/symbols/path", params={"path": str(repo), "from": "src/a.ts#a", "to": "src/a.ts#zzz"}).status_code == 404
    missing = client.get("/api/symbols/path", params={"path": str(repo), "from": "src/a.ts#b", "to": "src/a.test.ts", "tests": "false"}).json()
    assert missing["found"] is True  # the end itself may be a test file; only steps through tests are skipped
