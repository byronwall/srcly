"""
Progress hooks for ``analysis.scan_codebase``.

The scan calls these methods from the thread running the scan. The default
implementation does nothing; ``scan_jobs.ScanJob`` overrides them to publish
progress to SSE subscribers. Keep overrides cheap: they run inline with the
scan loop.
"""

from __future__ import annotations

from typing import Optional


class ScanObserver:
    def discovering(self, files_found: int, current_dir: str) -> None:
        """Called periodically while walking the tree to find files."""

    def analyzing(self, files_total: int) -> None:
        """Called once discovery is done, before per-file analysis starts."""

    def file_started(self, path: str) -> None:
        """Called when a file is handed to a worker."""

    def file_done(
        self,
        files_done: int,
        files_total: int,
        path: str,
        failure_reason: Optional[str],
        failure_detail: str = "",
    ) -> None:
        """Called after each file finishes (successfully or not)."""

    def building(self) -> None:
        """Called once analysis is done, while the tree is assembled."""


NULL_OBSERVER = ScanObserver()
