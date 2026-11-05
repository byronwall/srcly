"""
Cognitive complexity follows Sonar's rules, so a flat chain of checks scores
low and nested control flow scores high, even at the same CCN.
"""

from pathlib import Path

from app.services import analysis

TS = """export function flat(m: string, p: string) {
  if (m === 'GET' && p === '/a') return 1;
  if (m === 'POST' && p === '/b') return 2;
  if (m === 'PUT' && p === '/c') return 3;
  return 0;
}
export function nested(xs: number[]) {
  for (const x of xs) {
    if (x) {
      if (x > 1) { return 1; } else { return 2; }
    }
  }
  return 0;
}
export function guarded(a: boolean, b: boolean) {
  try {
    if (a) return 1;
  } catch (e) {
    if (b) return 2;
  }
  return 0;
}
"""

PY = """def walk(xs, y, z):
    for x in xs:
        if x and y and z:
            pass
        elif x:
            pass
    return 0
"""


def _functions(tmp_path: Path, name: str, source: str) -> dict:
    (tmp_path / name).write_text(source, encoding="utf-8")
    tree = analysis.scan_codebase(tmp_path, verbose=False)
    file = next(n for n in tree.children if n.name == name)
    return file, {n.name: (n.metrics.complexity, n.metrics.cognitive_complexity) for n in file.children}


def test_flat_checks_score_lower_than_nesting_at_the_same_ccn(tmp_path: Path) -> None:
    file, scores = _functions(tmp_path, "routes.ts", TS)
    # if +1 and && +1, three times; no nesting.
    assert scores["flat"] == (7, 6)
    # for +1, if +2 (in the loop), if +3 (in both), else +1.
    assert scores["nested"] == (4, 7)
    # A try does not nest: if +1, catch +1, if +2 (in the catch).
    assert scores["guarded"] == (4, 4)
    assert file.metrics.cognitive_complexity == 7
    assert file.metrics.witnesses["cognitive_complexity"].name == "nested"


def test_python_runs_of_one_operator_count_once(tmp_path: Path) -> None:
    _, scores = _functions(tmp_path, "walk.py", PY)
    # for +1, if +2 (in the loop), `and` run +1, elif +1.
    assert scores["walk"][1] == 5
