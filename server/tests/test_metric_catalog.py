from fastapi.testclient import TestClient

from app.main import app
from app.models import Metrics
from app.services import metric_catalog
from app.services.compare.diff import METRICS_BY_NAME, verdict
from snapshot_util import check_snapshot

# Metrics fields that aren't metric values.
_NOT_METRICS = {
    "last_modified",
    "gitignored_count",
    "complexity_witness",
    "witnesses",
    "na_reason",
    "analysis_status",
    "analysis_error",
    "analysis_failed_count",
}


def test_every_metrics_field_has_one_catalog_entry() -> None:
    fields = set(Metrics.model_fields) - _NOT_METRICS
    assert fields == set(metric_catalog.METRICS_BY_ID)
    assert len(metric_catalog.METRICS) == len(metric_catalog.METRICS_BY_ID)


def test_entries_are_well_formed() -> None:
    groups = {gid for gid, _ in metric_catalog.GROUPS}
    for spec in metric_catalog.METRICS:
        assert len(spec.short_label) <= 5, spec.id
        assert spec.group in groups, spec.id
        assert spec.color_domain[0] < spec.color_domain[1] < spec.color_domain[2], spec.id
        assert spec.group != "Detail" or spec.direction == "neutral", spec.id
        if spec.weights:
            assert spec.rankable and set(spec.weights) <= set(metric_catalog.PROFILES), spec.id


def test_languages_and_scope_come_from_the_analyzer_tables() -> None:
    get = metric_catalog.get
    assert get("loc").languages is None and get("loc").scope == "any"
    assert get("file_size").scope == "file"
    assert get("component_hook_count").languages == ["tsx"]
    assert get("component_hook_count").scope == "any"
    assert get("ts_any_usage_count").languages == ["ts", "tsx"]
    assert get("ts_any_usage_count").scope == "file"
    assert set(get("complexity").languages or []) == {"ts", "tsx", "python", "code"}
    assert get("md_data_url_count").languages == ["markdown"]


def test_witnessed_metrics_are_complexity_and_components() -> None:
    witnessed = {m.id for m in metric_catalog.METRICS if m.witness}
    assert witnessed == {"complexity"} | {m for m in metric_catalog.METRICS_BY_ID if m.startswith("component_")}


def test_profile_lead_is_the_heaviest_weight() -> None:
    assert metric_catalog.profile_lead("general") == "complexity"
    assert metric_catalog.profile_lead("frontend") == "component_loc"
    assert metric_catalog.profile_lead("docs") == "md_data_url_count"


def test_catalog_endpoint_serves_the_catalog() -> None:
    response = TestClient(app).get("/api/metrics/catalog")
    assert response.status_code == 200
    body = response.json()
    assert body == metric_catalog.catalog_payload()
    complexity = next(m for m in body["metrics"] if m["id"] == "complexity")
    assert complexity["direction"] == "higher-worse"
    assert complexity["unit"] == "CCN"
    assert complexity["witness"] is True


def test_client_catalog_snapshot_is_current() -> None:
    # client/src/test/setup.ts loads this, so client tests run on the real catalog.
    check_snapshot("metric-catalog.json", metric_catalog.catalog_payload())


def test_compare_directions_come_from_the_catalog() -> None:
    assert METRICS_BY_NAME["comment_noise"].direction == "lower"
    assert verdict(METRICS_BY_NAME["comment_noise"].direction, 0, 2) == "worse"
    assert verdict(METRICS_BY_NAME["comment_noise"].direction, 3, 1) == "better"
    assert METRICS_BY_NAME["loc"].direction == "neutral"
    assert METRICS_BY_NAME["todo_count"].direction == "neutral"
    assert METRICS_BY_NAME["component_hook_count"].aggregation == "max"
    assert "file_count" not in METRICS_BY_NAME
