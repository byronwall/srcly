"""Lay findings over a scan tree: per-file counts, folder sums, root status."""

from __future__ import annotations

import os
from typing import Any, Callable, Optional

from app.services.analysis_types import FINDINGS_METRICS
from app.services.findings.model import FindingsResult
from app.services.findings.typescript import TS_EXTENSIONS

RUNNING_REASON = "Checks are still running"


def _na(metrics: dict[str, Any], reason: str) -> None:
    for name in FINDINGS_METRICS:
        metrics[name] = None
    reasons = dict(metrics.get("na_reasons") or {})
    reasons.update({name: reason for name in FINDINGS_METRICS})
    metrics["na_reasons"] = reasons


def _measured(metrics: dict[str, Any], findings: int, errors: int) -> None:
    metrics["finding_count"], metrics["error_count"] = findings, errors
    reasons = {k: v for k, v in (metrics.get("na_reasons") or {}).items() if k not in FINDINGS_METRICS}
    metrics["na_reasons"] = reasons or None


def uncovered_reason(path: str, result: FindingsResult) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in TS_EXTENSIONS and any(t.tool == "tsc" for t in result.tools):
        return "Not part of any checked tsconfig project"
    return f"No checker for {ext or 'extensionless'} files"


def file_counts(path: str, result: FindingsResult, per_file: dict[str, list[int]]) -> tuple[Optional[int], Optional[int], str]:
    """(findings, errors, N/A reason) for one file."""
    if result.status == "running":
        return None, None, RUNNING_REASON
    if result.status != "ok":
        return None, None, result.reason or "Checks did not run"
    covering = result.covering(path)
    if not covering:
        return None, None, uncovered_reason(path, result)
    failed = next((t for t in covering if not t.ok), None)
    if failed is not None:
        return None, None, failed.reason
    count, errors = per_file.get(path, (0, 0))
    return count, errors, ""


def apply_to_tree(
    tree: dict[str, Any],
    result: FindingsResult,
    path_of: Callable[[str], Optional[str]] = lambda p: p,
) -> dict[str, Any]:
    """
    Set ``finding_count`` / ``error_count`` on every file of a ``Node`` JSON
    tree and sum them into folders. A file no tool covers, or whose tool
    failed or timed out, is N/A with the reason, never 0. ``path_of`` maps a
    node's path to the absolute path the tools reported (identity by default).
    Scopes keep N/A: findings are per file. The root gets ``findings`` (status
    and the tools that ran). Mutates and returns ``tree``.
    """
    per_file: dict[str, list[int]] = {}
    for f in result.findings:
        entry = per_file.setdefault(f.path, [0, 0])
        entry[0] += 1
        entry[1] += f.severity == "error"

    def visit(node: dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
        metrics = node.setdefault("metrics", {})
        kind = node.get("type")
        if kind == "file":
            path = path_of(node.get("path", ""))
            if path is None:
                _na(metrics, "Outside the checked folder")
                return None, None
            count, errors, reason = file_counts(path, result, per_file)
            if count is None:
                _na(metrics, reason)
            else:
                _measured(metrics, count, errors or 0)
            return count, errors
        if kind != "folder":
            return None, None
        total = errors = None
        for child in node.get("children") or []:
            c, e = visit(child)
            if c is not None:
                total = (total or 0) + c
                errors = (errors or 0) + (e or 0)
        if total is None:
            _na(metrics, RUNNING_REASON if result.status == "running" else "No file below was checked")
        else:
            _measured(metrics, total, errors or 0)
        return total, errors

    visit(tree)
    tree["findings"] = result.info()
    return tree


def file_findings(path: str, result: Optional[FindingsResult]) -> dict[str, Any]:
    """The findings list for one file, with the tools that covered it (the code viewer's evidence)."""
    if result is None:
        return {"status": "na", "reason": "No scan has run checks on this file", "tools": [], "findings": []}
    path = os.path.realpath(path)
    count, _errors, reason = file_counts(path, result, {})
    tools = [t.summary() for t in result.covering(path)] if result.status == "ok" else []
    if count is None:
        status = "running" if result.status == "running" else "na"
        return {"status": status, "reason": reason, "tools": tools, "findings": []}
    findings = [f.as_dict() for f in result.findings if f.path == path]
    return {"status": "ok", "reason": "", "tools": tools, "findings": findings}


def markers_for(path: str, result: Optional[FindingsResult]) -> dict[str, list[dict]]:
    """Code viewer line marks: every finding under ``finding_count``, errors also under ``error_count``."""
    data = file_findings(path, result)
    if data["status"] != "ok":
        return {}
    labels = {t["id"]: t["tool"] for t in data["tools"]}
    out: dict[str, list[dict]] = {}
    for f in data["findings"]:
        tool = labels.get(f["tool"], f["tool"].split(":", 1)[0])
        marker = {"line": f["line"], "end_line": f["line"], "note": f"{tool} {f['rule']}: {f['message'].splitlines()[0]}"}
        out.setdefault("finding_count", []).append(marker)
        if f["severity"] == "error":
            out.setdefault("error_count", []).append(marker)
    for markers in out.values():
        markers.sort(key=lambda m: m["line"])
    return out
