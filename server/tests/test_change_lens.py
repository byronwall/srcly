"""Change Lens on the acceptance repo (docs/intent/change-lens/contract.md)."""

from __future__ import annotations

import subprocess

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.changelens import service
from app.services.changelens.models import WORKTREE
from app.services.changelens.window import LensError, Params
from tests.fixtures.change_lens_repo import BASE_DATE, COMMITS, _git, _write, build


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


# -- small repos, one per rule ---------------------------------------------------


class Mini:
    """A tiny repo. Each git call is one hour after the last, from a fixed start."""

    def __init__(self, path):
        path.mkdir(parents=True)
        self.path, self.n = path.resolve(), 0
        self.git("init", "--quiet", "--initial-branch=main")

    def git(self, *args: str) -> str:
        self.n += 1
        return _git(self.path, *args, date=f"2026-03-{1 + self.n // 24:02d}T{self.n % 24:02d}:00:00+00:00")

    def commit(self, subject: str, files: dict) -> str:
        _write(self.path, files)
        self.git("add", "-A")
        self.git("commit", "--quiet", "-m", subject)
        return self.git("rev-parse", "HEAD")

    def lens(self, **params) -> dict:
        return service.build_payload(self.path, Params(**params))


AFTER_BASE = {"window": "custom", "since": "2026-03-01T03:30:00+00:00", "until": "2026-03-30T00:00:00+00:00"}
"""A time window that starts after a repo's first commit (made at 03:00)."""


def fn(name: str, k: int) -> str:
    return f"export function {name}(x: number) {{\n  const v = x + {k};\n  return v;\n}}\n"


def test_time_window_leaves_out_what_an_upstream_merge_brought_in(tmp_path):
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"a.ts": fn("a", 1), "c.ts": fn("c", 1), "up.ts": fn("up", 1)})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.commit("edit a", {"a.ts": fn("a", 2)})
    repo.git("checkout", "--quiet", "main")
    repo.commit("main edits up and c", {"up.ts": fn("up", 50), "c.ts": fn("c", 50)})
    repo.git("checkout", "--quiet", "feature")
    repo.git("merge", "--quiet", "--no-ff", "-m", "Merge main", "main")
    repo.commit("edit c", {"c.ts": fn("c", 51)})
    for mode in ("touched", "net"):
        chunks = by_id(repo.lens(mode=mode, **AFTER_BASE))
        assert set(chunks) == {"a.ts::a", "c.ts::c"}, mode
        assert (chunks["c.ts::c"]["netAdded"], chunks["c.ts::c"]["netDeleted"]) == (1, 1)
    diff = service.hunk_diff(repo.path, Params(**AFTER_BASE), "c.ts::c")["diff"]
    assert "-  const v = x + 50;" in diff and "+  const v = x + 51;" in diff


def test_pr_merges_count_on_a_default_branch_ahead_of_its_upstream(tmp_path):
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"a.ts": fn("a", 1), "b.ts": fn("b", 1)})
    repo.git("checkout", "--quiet", "-b", "pr")
    repo.commit("pr edits a", {"a.ts": fn("a", 9)})
    repo.git("checkout", "--quiet", "main")
    repo.git("merge", "--quiet", "--no-ff", "-m", "Merge PR", "pr")
    repo.git("update-ref", "refs/remotes/origin/main", "HEAD")
    repo.commit("local edit b", {"b.ts": fn("b", 5)})
    payload = repo.lens(**AFTER_BASE)
    assert set(by_id(payload)) == {"a.ts::a", "b.ts::b"}
    assert not any("upstream" in note for note in payload["selection"]["notes"])


def test_same_named_scopes_pair_by_body_and_anonymous_objects_are_no_chunks(tmp_path):
    load = "def load(x):\n    if x:\n        return 1\n    return 0\n"
    config = 'register({\n  name: "a",\n  retries: 1,\n});\n'
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"m.py": load, "conf.ts": config})
    repo.git("checkout", "--quiet", "-b", "feature")
    stubs = "@overload\ndef load(x: int) -> int: ...\n@overload\ndef load(x: str) -> str: ...\n"
    repo.commit("overloads above load, one retry more", {"m.py": stubs + load, "conf.ts": config.replace("1", "2")})
    chunks = by_id(repo.lens())
    # The untouched `load` is not listed, wherever it now is in the file.
    assert {c["status"] for c in chunks.values() if c["path"] == "m.py"} == {"added"}
    assert [(c["kind"], c["id"]) for c in chunks.values() if c["path"] == "conf.ts"] == [("file", "conf.ts")]


def test_a_path_reused_after_a_rename_is_a_new_file(tmp_path):
    body = "".join(fn(name, 1) for name in ("one", "two", "three"))
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"a.ts": body})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.git("mv", "a.ts", "b.ts")
    repo.commit("rename a to b", {})
    repo.commit("a new a", {"a.ts": fn("fresh", 7)})
    for mode in ("touched", "net"):
        payload = repo.lens(mode=mode)
        assert [(f["path"], f["status"]) for f in payload["files"]] == [("a.ts", "added"), ("b.ts", "renamed")]
        assert {(c["id"], c["status"]) for c in payload["chunks"]} == {("a.ts::fresh", "added"), ("b.ts", "moved")}


def test_doc_comment_and_decorator_above_a_method_belong_to_the_method(tmp_path):
    api = "export class Api {\n  /** Loads one. */\n  @log()\n  load(id: string) {\n    return id;\n  }\n}\n"
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"api.ts": api})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.commit("reword, trace", {"api.ts": api.replace("Loads one", "Loads one item").replace("@log()", "@trace()")})
    chunks = by_id(repo.lens())
    assert set(chunks) == {"api.ts::Api.load"} and chunks["api.ts::Api.load"]["added"] == 2


def test_a_class_diff_leaves_out_the_lines_of_its_methods(tmp_path):
    store = "export class Store {\n  private n = 0;\n\n  add(x: number) {\n    return x + 1;\n  }\n}\n"
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"s.ts": store})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.commit("edit field and method", {"s.ts": store.replace("n = 0", "n = 5").replace("x + 1", "x + 2")})
    diff = service.hunk_diff(repo.path, Params(), "s.ts::Store")["diff"]
    assert "+  private n = 5;" in diff and "x + 2" not in diff
    assert "+    return x + 2;" in service.hunk_diff(repo.path, Params(), "s.ts::Store.add")["diff"]


def test_only_a_newline_ends_a_line(tmp_path):
    odd = "/* a\x0cb\u2028c\rd */\n\n"
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"a.ts": fn("a", 1), "c.ts": odd + fn("c", 1)})
    repo.git("checkout", "--quiet", "-b", "feature")
    # A lone CR in an added line once read as the start of a new file in the diff.
    repo.commit("edit", {"a.ts": fn("a", 2) + "/* log:\rdiff --git a/x b/x */\n", "c.ts": odd + fn("c", 2)})
    chunks = by_id(repo.lens())
    assert set(chunks) == {"a.ts", "a.ts::a", "c.ts::c"}
    assert (chunks["c.ts::c"]["startLine"], chunks["c.ts::c"]["added"], chunks["c.ts::c"]["deleted"]) == (3, 1, 1)
    assert "@@ -3,4 +3,4 @@" in service.hunk_diff(repo.path, Params(), "c.ts::c")["diff"]


def test_a_renamed_markdown_heading_is_one_section(tmp_path):
    readme = "# Tool\n\nIntro.\n\n## Usage\n\nUse it.\n\n## More\n\nText.\n"
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"README.md": readme})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.commit("rename heading", {"README.md": readme.replace("## Usage", "## How to use")})
    (section,) = repo.lens()["chunks"]
    assert (section["id"], section["status"], section["match"]) == ("README.md::## How to use", "modified", "uncertain")
    assert (section["netAdded"], section["netDeleted"]) == (1, 1)


def test_a_syntax_error_at_head_gives_one_unmeasured_chunk_and_a_note(tmp_path):
    good = fn("ok", 1) + "\n" + fn("other", 1)
    repo = Mini(tmp_path / "r")
    repo.commit("base", {"s.ts": good})
    repo.git("checkout", "--quiet", "-b", "feature")
    repo.commit("break", {"s.ts": good.replace("const v = x + 1;\n  return v;\n}\n\n", "const v = x + ;\n  return v;\n\n")})
    payload = repo.lens()
    (chunk,) = payload["chunks"]
    assert (chunk["kind"], chunk["measured"], chunk["metrics"]) == ("range", False, {})
    assert chunk["naReason"].startswith("Syntax error at head")
    assert any("s.ts has a syntax error at head" in note for note in payload["selection"]["notes"])


def test_models_mirror_the_client_types():
    """Each interface in types.ts has a model with the same field names on the wire."""
    import re
    from pathlib import Path

    from app.services.changelens import models

    source = (Path(__file__).resolve().parents[2] / "client/src/changelens/types.ts").read_text(encoding="utf-8")
    interfaces = re.findall(r"export interface (\w+) \{\n(.*?)\n\}", source, flags=re.S)
    assert len(interfaces) >= 10
    for name, body in interfaces:
        fields = set(re.findall(r"^  (\w+)\??:", body, flags=re.M))
        model = getattr(models, name)
        assert {f.alias or n for n, f in model.model_fields.items()} == fields, name
