from pathlib import Path

from app.services import size_budget

OVER = 4 * size_budget.BUDGET_TOKENS + 400  # bytes


def test_ratchet_lets_big_files_shrink_but_not_grow(tmp_path: Path) -> None:
    big = tmp_path / "big.ts"
    big.write_text("x" * OVER)
    (tmp_path / "small.ts").write_text("x")
    out = tmp_path / ".srcly"
    out.mkdir()
    budget = size_budget.write(tmp_path, out)
    assert list(size_budget.read(budget)["files"]) == ["big.ts"]
    assert size_budget.check(tmp_path, budget)[0] == 0

    big.write_text("x" * (OVER + 10))
    code, text = size_budget.check(tmp_path, budget)
    assert code == 1 and "big.ts" in text

    # Shrinking passes, and the next report lowers the baseline, so growing back fails.
    big.write_text("x" * (OVER - 100))
    assert size_budget.check(tmp_path, budget)[0] == 0
    size_budget.write(tmp_path, out)
    big.write_text("x" * (OVER - 50))
    assert size_budget.check(tmp_path, budget)[0] == 1

    # A file that goes over the budget for the first time fails too.
    big.write_text("x" * (OVER - 100))
    (tmp_path / "small.ts").write_text("x" * OVER)
    code, text = size_budget.check(tmp_path, budget)
    assert code == 1 and "small.ts" in text
