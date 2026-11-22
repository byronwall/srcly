"""Changed Paths is Git inventory, not an expansion of structural metrics."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.changelens import inventory, service
from app.services.changelens.window import Params
from app.services.compare.git_refs import GitError
from tests.fixtures.change_lens_repo import _git, _write


def make_repo(path: Path) -> Path:
    path.mkdir()
    _git(path, "init", "-q", "-b", "main")
    _git(path, "config", "user.name", "Fixture")
    _git(path, "config", "user.email", "fixture@example.test")
    _git(path, "config", "core.filemode", "true")
    return path


def commit(repo: Path, message: str, files: dict | None = None) -> str:
    if files:
        _write(repo, files)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", message)
    return _git(repo, "rev-parse", "HEAD")


def selected(base: str, head: str, mode: str = "touched", worktree: bool | None = False) -> Params:
    return Params(window="custom", mode=mode, base=base, head=head, worktree=worktree)


def rows(payload: dict) -> dict[str, dict]:
    return {r["path"]: r for r in payload["changedPaths"]["rows"]}


@pytest.mark.skipif(os.name == "nt", reason="requires executable mode and unusual path characters")
def test_git_inventory_and_exact_path_evidence(tmp_path):
    repo = make_repo(tmp_path / "repo")
    old, new = "src/a\t🔗.json", "src/b\n🔗.json"
    base = commit(repo, "base", {
        "src/rules.json": '{"dial": 1}\n',
        "src/mode.sh": "#!/bin/sh\necho here\n",
        "src/blob.bin": "\0old",
        old: '{"value": 42}\n',
        "outside.json": "{}\n",
        "src/live.ts": "export function changed() {\n  return 1;\n}\n",
    })
    _git(repo, "mv", "--", old, new)
    (repo / "src/mode.sh").chmod(0o755)
    first = commit(repo, "mix text, metadata, rename and binary", {
        "src/rules.json": '{"dial": 2}\n',
        "src/blob.bin": "\0new",
        "outside.json": '{"outer": true}\n',
        "src/live.ts": "export function changed() {\n  if (Date.now()) return 2;\n  return 1;\n}\n",
    })
    head = commit(repo, "revert just the model", {"src/rules.json": '{"dial": 1}\n'})
    params = selected(base, head)
    payload = service.build_payload(repo, params)
    by_path = rows(payload)
    assert set(by_path) == {"src/rules.json", "src/mode.sh", "src/blob.bin", new, "outside.json", "src/live.ts"}
    assert by_path["src/live.ts"]["measured"]
    assert all(not by_path[p]["measured"] and by_path[p]["metricReason"] for p in ("src/rules.json", "src/mode.sh", "src/blob.bin"))
    json = by_path["src/rules.json"]
    assert (json["commits"], json["status"], json["hasNetDiff"]) == ([first, head], "reverted", False)
    assert "src/rules.json" not in rows(service.build_payload(repo, selected(base, head, "net")))
    reverted = service.path_diff(repo, params, json["id"])
    assert "No endpoint diff" in reverted["reason"] and not reverted["diff"] and not reverted["headSource"]
    changed = service.path_diff(repo, params, json["id"], first[:8])
    assert '+{"dial": 2}' in changed["diff"] and changed["reason"] is None
    assert (changed["baseRevision"], changed["headRevision"]) == (base, first)
    assert changed["headSource"] == {
        "repoRoot": str(repo), "path": "src/rules.json", "side": "head", "revision": first, "startLine": 1, "endLine": 1,
    }

    for path, why in (("src/mode.sh", "Mode-only"), ("src/blob.bin", "Binary")):
        evidence = service.path_diff(repo, params, by_path[path]["id"])
        assert why in evidence["reason"] and not evidence["diff"]
        assert evidence["baseSource"] is None and evidence["headSource"] is None

    assert (by_path[new]["oldPath"], by_path[new]["status"]) == (old, "renamed")
    renamed = service.path_diff(repo, params, by_path[new]["id"])
    assert renamed["baseSource"]["path"] == old and renamed["baseSource"]["revision"] == base
    assert renamed["headSource"]["path"] == new and renamed["headSource"]["revision"] == head
    assert "Rename only" in renamed["reason"] and not renamed["diff"]

    scoped = rows(service.build_payload(repo / "src", params))
    assert set(scoped) == set(by_path) - {"outside.json"}


def test_unsupported_only_and_dirty_worktree_do_not_claim_empty_or_complete(tmp_path):
    repo = make_repo(tmp_path / "repo")
    base = commit(repo, "base", {"rules.json": "{}\n"})
    head = commit(repo, "committed", {"rules.json": '{"event": "committed"}\n'})
    _write(repo, {"rules.json": '{"event": "working copy"}\n'})
    client = TestClient(app)
    query = {"path": str(repo), "window": "custom", "base": base, "head": head}
    payload = client.get("/api/change-lens", params=query).json()
    inv = payload["changedPaths"]
    assert not inv["rows"] and "committed ranges" in inv["unavailableReason"]
    assert inv["headRevision"] is None and inv["baseRevision"] is None
    query["worktree"] = "false"
    pinned = client.get("/api/change-lens", params=query)
    assert pinned.status_code == 200
    payload = pinned.json()
    assert payload["chunks"] == [] and "Nothing changed" not in " ".join(payload["selection"]["notes"])
    row = rows(payload)["rules.json"]
    selected_path = client.get("/api/change-lens/path-diff", params={**query, "id": row["id"]})
    assert selected_path.status_code == 200
    assert "committed" in selected_path.json()["diff"] and "working copy" not in selected_path.json()["diff"]
    assert selected_path.json()["headSource"]["revision"] == head


def test_touched_rename_is_not_reverted_when_git_endpoints_split_it(tmp_path):
    repo = make_repo(tmp_path / "repo")
    base = commit(repo, "base", {"old.json": "old content\n" * 30})
    _git(repo, "mv", "--", "old.json", "new.json")
    rename = commit(repo, "rename only")
    head = commit(repo, "rewrite completely", {"new.json": "unrelated content\n" * 30})
    params = selected(base, head)
    row = rows(service.build_payload(repo, params))["new.json"]
    assert row["status"] == "renamed" and row["commits"] == [rename, head]
    assert not row["hasNetDiff"]
    endpoint = service.path_diff(repo, params, row["id"])
    assert "did not pair" in endpoint["reason"] and endpoint["compareUnavailableReason"]
    assert service.path_diff(repo, params, row["id"], rename)["baseSource"]["path"] == "old.json"
    assert set(rows(service.build_payload(repo, selected(base, head, "net")))) == {"old.json", "new.json"}


def test_historical_blob_unavailable_does_not_fall_back(tmp_path, monkeypatch):
    repo = make_repo(tmp_path / "repo")
    base = commit(repo, "base", {"rules.json": "{}\n"})
    head = commit(repo, "edit", {"rules.json": '{"x": 1}\n'})
    _write(repo, {"rules.json": '{"x": "working tree"}\n'})
    params = selected(base, head)
    row = rows(service.build_payload(repo, params))["rules.json"]
    git = inventory.git

    def no_blob(repo: Path, *args: str, **kwargs) -> str:
        if args[0] == "cat-file":
            raise GitError("Missing blob")
        return git(repo, *args, **kwargs)

    monkeypatch.setattr(inventory, "git", no_blob)
    evidence = service.path_diff(repo, params, row["id"])
    assert "Historical source is unavailable" in evidence["reason"]
    assert evidence["baseSource"] is None and evidence["headSource"] is None
    assert not evidence["diff"]
