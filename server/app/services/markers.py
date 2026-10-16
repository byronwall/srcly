"""Where each metric fires in a file: the lines behind a metric's count.

The analyzers count metrics during a scan. With a ``MarkerSink`` attached they
also record the node behind each count, so the code viewer can overlay the
lines that make a metric high. Scans never attach a sink, so they pay nothing.
"""

from __future__ import annotations

import os
import re
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Marker:
    line: int
    end_line: int
    note: str = ""

    def as_dict(self) -> dict:
        return {"line": self.line, "end_line": self.end_line, "note": self.note}


class MarkerSink:
    """Collects markers per metric id (the ``Metrics`` field name)."""

    def __init__(self) -> None:
        self.by_metric: dict[str, list[Marker]] = defaultdict(list)

    def add(self, metric: str, node, note: str = "", *, span: bool = False) -> None:
        """Mark ``node``'s first line, or every line it covers when ``span``."""
        start = node.start_point.row + 1
        end = node.end_point.row + 1 if span else start
        self.by_metric[metric].append(Marker(start, end, note))

    def add_line(self, metric: str, line: int, note: str = "") -> None:
        self.by_metric[metric].append(Marker(line, line, note))

    def as_dict(self) -> dict[str, list[dict]]:
        return {
            metric: [m.as_dict() for m in sorted(markers, key=lambda m: (m.line, m.end_line))]
            for metric, markers in self.by_metric.items()
            if markers
        }


_TODO_RE = re.compile(r"\b(TODO|FIXME)\b")


def _todo_markers(path: Path) -> dict[str, list[dict]]:
    """Files without a tree-sitter analyzer: TODO/FIXME lines only."""
    sink = MarkerSink()
    try:
        with path.open(encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, start=1):
                match = _TODO_RE.search(line)
                if match:
                    sink.add_line("todo_count", i, match.group(1))
    except OSError:
        return {}
    return sink.as_dict()


def collect_markers(file_path: str) -> dict[str, list[dict]]:
    """Markers for every metric the file's analyzer can locate."""
    from app.services.python.python_analysis import PythonTreeSitterAnalyzer
    from app.services.typescript.typescript_analysis import TreeSitterAnalyzer

    path = Path(file_path)
    if path.suffix in {".ts", ".tsx"}:
        analyzer = TreeSitterAnalyzer()
    elif path.suffix == ".py":
        analyzer = PythonTreeSitterAnalyzer()
    else:
        return _todo_markers(path)

    sink = MarkerSink()
    analyzer.markers = sink
    analyzer.analyze_file(str(path))
    return sink.as_dict()


def collect_markers_for_text(text: str, suffix: str) -> dict[str, list[dict]]:
    """Markers for content that isn't on disk (a file at a git ref)."""
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        return collect_markers(tmp)
    finally:
        os.unlink(tmp)
