"""`srcly report` and the explorer's Hot Spots rank the same fixture the same way.

The server side runs the report on ``tests/fixtures``. The client side
(``client/src/utils/hotSpotRanking.parity.test.ts``) ranks the scanned tree
committed in ``snapshots/ranking-parity.json`` with ``rankHotSpots``. Both
must give the ``expected`` top 10 stored beside it.
"""

from pathlib import Path

from app.models import Node
from app.services import reporting
from snapshot_util import check_snapshot

FIXTURES = Path(__file__).parent / "fixtures"
CASES = (
    "complexity",
    "loc",
    "comment_noise",
    "max_nesting_depth",
    "parameter_count",
    "component_loc",
    "component_hook_count",
    "component_jsx_conditional_count",
)
TOP = 10


def _portable(node: dict, prefix: str) -> dict:
    """The fields ranking reads, with paths relative to the fixture root, so the snapshot is small and portable."""
    return {
        "name": node["name"],
        "type": node["type"],
        "kind": node.get("kind"),
        "path": node["path"].removeprefix(prefix),
        "start_line": node["start_line"],
        "end_line": node["end_line"],
        "metrics": {metric: node["metrics"][metric] for metric in CASES},
        "children": [_portable(child, prefix) for child in node["children"]],
    }


def _top(rankings: list[dict]) -> list[list]:
    return [[item["path"], item["value"]] for item in rankings[:TOP]]


def test_report_and_client_rank_the_fixture_the_same() -> None:
    root = FIXTURES.resolve()
    expected: dict[str, list[list]] = {}
    tree = None
    for metric in CASES:
        payload = reporting.build_report_payload(root, metric=metric, limit=TOP, include_tree=True, verbose=False)
        expected[f"{metric}/file"] = _top(payload["hotspots"]["rankings"])
        expected[f"{metric}/function"] = _top(payload["hotspots"]["function_rankings"])
        tree = payload["tree"]
    assert tree is not None
    snapshot_tree = _portable(tree, str(root) + "/")

    # The committed tree ranks the same in Python, so the client sees the same input.
    node = Node.model_validate(snapshot_tree)
    for key, top in expected.items():
        metric, cohort = key.split("/")
        assert _top(reporting.rank_by_metric(node, metric, cohort=cohort)["ranked"]) == top, key
    assert expected["component_hook_count/file"][0][0] == "components/react/OrderDashboard.tsx"

    check_snapshot("ranking-parity.json", {"top": TOP, "expected": expected, "tree": snapshot_tree})
