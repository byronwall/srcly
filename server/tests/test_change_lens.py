"""Change Lens on the acceptance repo (docs/intent/change-lens/contract.md)."""

from __future__ import annotations

import subprocess

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.changelens import service
from app.services.changelens.models import WORKTREE
from app.services.changelens.window import LensError, Params
from tests.fixtures.change_lens_repo import BASE_DATE, COMMITS, build


@pytest.fixture(scope="module")
def repo(tmp_path_factory):
    return build(tmp_path_factory.mktemp("change-lens") / "repo")


@pytest.fixture(scope="module")
def touched(repo):
    return service.build_payload(repo, Params(mode="touched"))


@pytest.fixture(scope="module")
def net(repo):
    return service.build_payload(repo, Params(mode="net"))


def by_id(payload: dict) -> dict[str, dict]:
    return {chunk["id"]: chunk for chunk in payload["chunks"]}


def _rev(repo, ref: str) -> str:
    return subprocess.run(["git", "rev-parse", ref], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()


def test_branch_window_resolves_base_head_and_commits(repo, touched):
    selection = touched["selection"]
    assert selection["base"]["sha"] == _rev(repo, "main")
    assert selection["base"]["date"].startswith(BASE_DATE[:4])
    # The head is the working tree, because it holds an uncommitted edit.
    assert selection["head"] == {"ref": WORKTREE, "sha": None, "label": selection["head"]["label"], "date": None}
    assert "feature" in selection["head"]["label"]
    assert [c["subject"] for c in touched["commits"][:-1]] == [subject for subject, *_ in COMMITS]
    assert touched["commits"][-1]["sha"] == WORKTREE and touched["commits"][-1]["date"] is None


def test_only_edited_chunks_are_listed(touched):
    ids = set(by_id(touched))
    # worker.ts holds 18 functions; four were edited.
    assert {i for i in ids if i.startswith("src/worker.ts")} == {
        "src/worker.ts::parseArgs",
        "src/worker.ts::retryJob",
        "src/worker.ts::legacyCleanup",
        "src/worker.ts::formatLog",
    }
    assert "src/scheduler.ts::isIdle" not in ids
    assert touched["summary"]["filesEdited"] == len(touched["files"]) == 7


def test_repeated_edits_count_touches_and_separate_churn_from_net(touched):
    chunks = by_id(touched)
    retry, parse = chunks["src/worker.ts::retryJob"], chunks["src/worker.ts::parseArgs"]
    assert len(retry["touches"]) == 3 and len(parse["touches"]) == 1
    assert (retry["added"], retry["deleted"]) == (6, 1)
    assert (retry["netAdded"], retry["netDeleted"]) == (5, 0)
    complexity = retry["metrics"]["complexity"]
    assert complexity["before"] < 10 <= complexity["after"]
    assert retry["firstTouched"] < retry["lastTouched"]


def test_reverted_work_shows_in_touched_and_not_in_net(touched, net):
    pick = by_id(touched)["src/scheduler.ts::pickNext"]
    assert pick["status"] == "reverted" and len(pick["touches"]) == 2
    assert pick["netAdded"] == pick["netDeleted"] == 0 and pick["added"] > 0
    assert pick["metrics"]["complexity"]["before"] == pick["metrics"]["complexity"]["after"]
    assert touched["summary"]["reverted"] == 1

    assert "src/scheduler.ts::pickNext" not in by_id(net)
    assert net["summary"]["reverted"] == 0
    assert all(chunk["touches"] == [] and all(h["sha"] is None for h in chunk["hunks"]) for chunk in net["chunks"])
    # Everything else is a net difference too.
    assert set(by_id(net)) == set(by_id(touched)) - {"src/scheduler.ts::pickNext"}


def test_pure_rename_reports_no_complexity_change(touched, net):
    for payload in (touched, net):
        moved = by_id(payload)["src/util/text.ts"]
        assert (moved["status"], moved["match"], moved["oldPath"]) == ("moved", "renamed-file", "src/util/strings.ts")
        assert moved["netAdded"] == moved["netDeleted"] == 0
        assert moved["metrics"]["complexity"]["before"] == moved["metrics"]["complexity"]["after"]
        assert moved["buckets"] == []
    renamed = next(f for f in touched["files"] if f["path"] == "src/util/text.ts")
    assert renamed["status"] == "renamed" and renamed["oldPath"] == "src/util/strings.ts"


def test_deleted_function_stays_with_its_base_lines(touched):
    gone = by_id(touched)["src/worker.ts::legacyCleanup"]
    assert (gone["status"], gone["match"]) == ("deleted", "none")
    assert gone["baseEndLine"] - gone["baseStartLine"] == 5
    assert gone["metrics"]["complexity"]["before"] == 3 and gone["metrics"]["complexity"]["after"] is None


def test_markdown_and_config_are_not_measured_and_get_no_symbol(touched):
    chunks = by_id(touched)
    heading = chunks["README.md::## Install"]
    config = next(c for c in touched["chunks"] if c["path"] == "config/settings.yaml")
    assert (heading["kind"], heading["name"]) == ("heading", "## Install")
    assert (config["kind"], config["name"], config["startLine"]) == ("range", "line 3", 3)
    for chunk in (heading, config):
        assert chunk["measured"] is False and chunk["metrics"] == {} and chunk["naReason"] and chunk["buckets"] == []


def test_review_buckets(touched):
    chunks = by_id(touched)
    plan = chunks["src/planner.ts::planRoute"]
    assert plan["status"] == "added" and plan["buckets"] == ["new-hotspot"]
    assert plan["metrics"]["complexity"] == {"before": None, "after": plan["metrics"]["complexity"]["after"]}
    assert "complex-and-changed" in chunks["src/router.ts::dispatch"]["buckets"]
    assert chunks["src/worker.ts::retryJob"]["buckets"] == ["new-hotspot"]
    assert chunks["src/worker.ts::parseArgs"]["buckets"] == []


def test_working_tree_is_one_optional_entry(repo, touched):
    log = by_id(touched)["src/worker.ts::formatLog"]
    assert [t["sha"] for t in log["touches"]] == [WORKTREE]
    assert log["firstTouched"] is None and log["lastTouched"] is None
    assert touched["commits"][-1]["chunkIds"] == ["src/worker.ts::formatLog"]

    committed = service.build_payload(repo, Params(worktree=False))
    assert "src/worker.ts::formatLog" not in by_id(committed)
    assert committed["selection"]["head"]["sha"] == _rev(repo, "feature")
    assert all(c["sha"] != WORKTREE for c in committed["commits"])


def test_time_window_base_is_the_parent_of_its_oldest_commit(repo):
    payload = service.build_payload(
        repo, Params(window="custom", since="2026-01-06T17:00:00+00:00", until="2026-01-06T18:30:00+00:00")
    )
    assert [c["subject"] for c in payload["commits"]] == ["args: accept --dry-run", "retry: add jitter"]
    assert payload["selection"]["base"]["sha"] == _rev(repo, "feature~3")
    assert payload["selection"]["head"]["sha"] == _rev(repo, "feature~1")
    assert set(by_id(payload)) == {"src/worker.ts::parseArgs", "src/worker.ts::retryJob"}


def test_hunk_diff_for_a_chunk_and_for_one_commit(repo, touched):
    whole = service.hunk_diff(repo, Params(), "src/worker.ts::retryJob")
    assert "+  if (max > 20) max = 20;" in whole["diff"] and "jitter" in whole["diff"]
    # Only this chunk's lines: no neighbour, though parseArgs and formatLog changed in the same file.
    assert "parseArgs" not in whole["diff"] and "formatLog" not in whole["diff"] and "dryRun" not in whole["diff"]

    cap = next(c for c in touched["commits"] if c["subject"] == "retry: cap the attempt limit")
    one = service.hunk_diff(repo, Params(), "src/worker.ts::retryJob", cap["sha"])
    added = [line for line in one["diff"].splitlines() if line.startswith("+") and not line.startswith("+++")]
    assert added == ["+  if (max > 20) max = 20;"]
    assert one["to"] == cap["short"]

    assert service.hunk_diff(repo, Params(), "src/scheduler.ts::pickNext")["diff"] == ""
    with pytest.raises(LensError):
        service.hunk_diff(repo, Params(), "src/worker.ts::nope")


def test_api_serves_the_payload_and_refuses_a_folder_outside_git(repo, tmp_path):
    client = TestClient(app)
    ok = client.get("/api/change-lens", params={"path": str(repo), "mode": "net", "worktree": "0"})
    assert ok.status_code == 200
    assert ok.json()["selection"]["mode"] == "net" and ok.json()["selection"]["includesWorktree"] is False

    hunk = client.get("/api/change-lens/hunk", params={"path": str(repo), "chunk": "src/router.ts::dispatch"})
    assert hunk.status_code == 200 and "audit" in hunk.json()["diff"] and hunk.json()["from"].startswith("main")

    assert client.get("/api/change-lens", params={"path": str(tmp_path)}).status_code == 409
