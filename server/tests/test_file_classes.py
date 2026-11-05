import pytest

from app.services.file_classes import classify


@pytest.mark.parametrize(
    "path, expected",
    [
        ("server/app/run.py", "code"),
        ("client/src/App.tsx", "code"),
        ("server/tests/test_run.py", "test"),
        ("client/src/viz/layout.test.ts", "test"),
        ("docs/CODE_MAP.md", "docs"),
        ("public/styles.css", "style"),
        ("client/src/theme.scss", "style"),
        ("engine/test/integration/__snapshots__/golden.test.ts.snap", "fixture"),
        ("engine/examples/bad-ish-solid/src/App.tsx", "fixture"),
        ("client/src/dataflow/contract.generated.ts", "generated"),
        ("pnpm-lock.yaml", "generated"),
        ("public/vendor/chart.js", "vendored"),
        ("public/lib.min.js", "vendored"),
        (".github/workflows/ci.yml", "config"),
        ("docs/research/cases.tsv", "data"),
    ],
)
def test_classify_by_path(path: str, expected: str) -> None:
    assert classify(path)[0] == expected
