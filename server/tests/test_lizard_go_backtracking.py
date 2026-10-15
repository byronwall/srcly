"""
Regression test for lizard's tokenizer hanging on Go files with SQL strings.

lizard < 1.21.7 tokenizes generic brackets with
``\\<(?=(?:[^<>]*\\?)+[^<>]*\\>)``. After a ``<`` comparison with no closing
``>``, every later ``?`` (SQL placeholders in backtick strings) doubles the
backtracking, so humanlayer's hld/store/sqlite.go (66+ placeholders after
``currentVersion < 19``) never finished. lizard 1.21.7 changed the class to
``[^<>?]``, which is linear.

The blowup needs the next bracket after the placeholders to be another ``<``
(a closing ``>`` lets the lookahead succeed early), as in the fixture below.
"""

from pathlib import Path

from app.services.scan_workers import run_file_analyses

GO_SOURCE = """package store

func migrate(currentVersion int) error {
	if currentVersion < 19 {
		return nil
	}
	_, err := db.Exec(`
		INSERT INTO sessions (%s)
		VALUES (%s)
	`, %s)
	return err
}

func other(a, b int) int {
	if a < b {
		return b
	}
	return a
}
"""


def test_go_file_with_many_sql_placeholders_analyzes_quickly(tmp_path: Path) -> None:
    columns = ", ".join(f"c{i}" for i in range(60))
    placeholders = ", ".join("?" for _ in range(60))
    args = ", ".join(f"v{i}" for i in range(60))
    path = tmp_path / "sqlite.go"
    path.write_text(GO_SOURCE % (columns, placeholders, args))

    # Run through the real worker pool so a regression shows up as a timeout
    # failure instead of hanging the test run.
    outcome = run_file_analyses([str(path)], timeout_seconds=10, max_workers=1)

    assert outcome.failures == []
    [file_info] = outcome.results
    names = sorted(f.name for f in file_info.function_list)
    assert names == ["migrate", "other"]
    assert max(f.cyclomatic_complexity for f in file_info.function_list) == 2
