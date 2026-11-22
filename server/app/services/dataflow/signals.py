"""
Data-flow signals for srcly's pipelines (M7): per-file metrics, findings and
``dataflow.md``, from the engine's tier-2 ``fileSignals`` op.

Tier 2 builds the legacy render-path report, which takes minutes on a big
app, so nothing runs it by default: ``srcly report --dataflow`` and
``srcly compare --dataflow`` ask for it. The last result per root is kept on
disk, so the app colors the treemap and marks the code viewer from it while
the files still match.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from app.services.analysis_types import DATAFLOW_METRICS
from app.services.dataflow.engine import EngineError
from app.services.dataflow.models import FileSignalsResult

# The legacy report on a big app takes minutes; ``SRCLY_DATAFLOW_TIMEOUT`` still overrides it.
SIGNALS_TIMEOUT = 1800.0
TS_SUFFIXES = (".ts", ".tsx", ".mts", ".cts")

# Engine field → catalog metric id, and how a folder rolls it up.
FIELDS: dict[str, tuple[str, str]] = {
    "dataflow_impossible_defenses": ("impossibleDefenses", "sum"),
    "dataflow_relay_hops": ("relayHops", "max"),
    "dataflow_fan_out": ("fanOut", "max"),
    "dataflow_representation_changes": ("representationChanges", "max"),
    "dataflow_path_depth": ("pathDepth", "max"),
}
REPEATED_FORKS = "dataflow_repeated_forks"
# Rule → the metric whose code-viewer marks show it. Relay findings mark under Prop Relay.
RULE_METRIC = {
    "impossible-defense": "dataflow_impossible_defenses",
    "repeated-fork": REPEATED_FORKS,
    "context-relay": "dataflow_relay_hops",
    "broad-prop-bundle": "dataflow_relay_hops",
}


@dataclass
class Signals:
    root: str
    """The engine root, absolute; result paths are relative to it."""
    status: str
    """``ok`` or ``na``."""
    reason: str = ""
    result: Optional[FileSignalsResult] = None
    fingerprint: Optional[str] = None

    def per_file(self) -> dict[str, dict[str, int]]:
        """Absolute path → metric id → value, for every file the engine analyzed."""
        if self.result is None:
            return {}
        out: dict[str, dict[str, int]] = {}
        for item in self.result.files:
            m = item.metrics.model_dump()
            values = {metric: m[field] for metric, (field, _) in FIELDS.items()}
            values[REPEATED_FORKS] = 0
            out[os.path.join(self.root, item.file)] = values
        for f in self.result.findings:
            if f.rule == "repeated-fork":
                values = out.get(os.path.join(self.root, f.file))
                if values is not None:
                    values[REPEATED_FORKS] += 1
        return out

    def findings_in(self, path: str) -> list[dict[str, Any]]:
        if self.result is None:
            return []
        return [f.model_dump() for f in self.result.findings if os.path.join(self.root, f.file) == path]

    def as_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "status": self.status,
            "reason": self.reason,
            "fingerprint": self.fingerprint,
            "result": self.result.model_dump() if self.result else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Signals":
        result = data.get("result")
        return cls(
            root=data["root"],
            status=data["status"],
            reason=data.get("reason", ""),
            fingerprint=data.get("fingerprint"),
            result=FileSignalsResult.model_validate(result) if result else None,
        )


# -- running and caching ------------------------------------------------------


def _cache_file(root: Path) -> Path:
    from app.services.cache import cache_dir

    digest = hashlib.sha256(str(root).encode()).hexdigest()[:24]
    return cache_dir().parent / "dataflow-signals" / f"{digest}.json.gz"


# Saved file → (its mtime, the parsed result): the app reads it on every tree request.
_memo: dict[Path, tuple[float, Signals]] = {}


def cached(root: Path) -> Optional[Signals]:
    """The last finished result for ``root``, whatever its fingerprint."""
    path = _cache_file(root.resolve())
    try:
        mtime = path.stat().st_mtime
        hit = _memo.get(path)
        if hit is not None and hit[0] == mtime:
            return hit[1]
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            signals = Signals.from_dict(json.load(fh))
    except Exception:  # noqa: BLE001 - a missing or bad entry is a miss
        return None
    _memo[path] = (mtime, signals)
    return signals


def _save(root: Path, signals: Signals) -> None:
    target = _cache_file(root)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(f".{os.getpid()}.tmp")
        with gzip.open(tmp, "wt", encoding="utf-8") as fh:
            json.dump(signals.as_dict(), fh)
        os.replace(tmp, target)
    except OSError:
        pass  # the cache is best-effort


def collect(
    root: Path,
    *,
    fingerprint: Optional[str] = None,
    use_cache: bool = True,
    close_after: bool = False,
    registry: Any = None,
) -> Signals:
    """
    Signals for ``root``. Never raises: no Node, no engine, a Python root, a
    crash or a timeout comes back N/A with the reason. Reuses the saved result
    when ``fingerprint`` matches it. ``close_after`` stops the engine when done
    (compare's throwaway checkouts).
    """
    from app.services.dataflow import engine as dataflow_engine

    root = root.resolve()
    if use_cache and fingerprint:
        hit = cached(root)
        if hit is not None and hit.fingerprint == fingerprint and hit.status == "ok":
            return hit
    registry = registry or dataflow_engine.registry
    try:
        found = registry.probe(root)
        if not found.available:
            return Signals(str(root), "na", found.message or found.reason or "The data-flow engine is unavailable")
        if found.language != "typescript":
            return Signals(str(root), "na", "Data-flow signals cover TypeScript and TSX only")
        timeout = dataflow_engine.timeout_override() or SIGNALS_TIMEOUT
        raw = registry.query(root, "fileSignals", {}, timeout=timeout)
        result = FileSignalsResult.model_validate(raw)
    except EngineError as exc:
        return Signals(str(root), "na", f"Data flow not analyzed: {exc.message}")
    finally:
        if close_after:
            registry.close(root)
    signals = Signals(str(root), "ok", result=result, fingerprint=fingerprint)
    if fingerprint:
        _save(root, signals)
    return signals


# -- tree overlay ---------------------------------------------------------------


def _set_na(metrics: dict[str, Any], reason: str) -> None:
    for name in DATAFLOW_METRICS:
        metrics[name] = None
    reasons = dict(metrics.get("na_reasons") or {})
    reasons.update({name: reason for name in DATAFLOW_METRICS})
    metrics["na_reasons"] = reasons


def _set_values(metrics: dict[str, Any], values: dict[str, int]) -> None:
    metrics.update(values)
    reasons = {k: v for k, v in (metrics.get("na_reasons") or {}).items() if k not in DATAFLOW_METRICS}
    metrics["na_reasons"] = reasons or None


def apply_to_tree(
    tree: dict[str, Any],
    signals: Signals,
    path_of: Callable[[str], Optional[str]] = lambda p: p,
) -> dict[str, Any]:
    """
    Set the data-flow metrics on every TS/TSX file of a ``Node`` JSON tree and
    roll them into folders (sums for counts, maxes for the worst path). A TS
    file the engine did not analyze is N/A with the reason, never 0; other
    languages stay unmeasured. The root gets ``dataflow`` (status and reason).
    """
    per_file = signals.per_file()
    rollup = {metric: agg for metric, (_, agg) in FIELDS.items()} | {REPEATED_FORKS: "sum"}
    if signals.status != "ok":
        missing = signals.reason
    else:
        missing = "Not in the data-flow program (outside its tsconfig)"

    def visit(node: dict[str, Any]) -> Optional[dict[str, int]]:
        metrics = node.setdefault("metrics", {})
        kind = node.get("type")
        if kind == "file":
            path = path_of(node.get("path", ""))
            if path is None or not path.endswith(TS_SUFFIXES) or path.endswith(".d.ts"):
                return None
            values = per_file.get(path)
            if values is None:
                _set_na(metrics, missing)
                return None
            _set_values(metrics, values)
            return values
        if kind != "folder":
            return None
        total: Optional[dict[str, int]] = None
        for child in node.get("children") or []:
            values = visit(child)
            if values is None:
                continue
            if total is None:
                total = dict(values)
                continue
            for metric, agg in rollup.items():
                total[metric] = total[metric] + values[metric] if agg == "sum" else max(total[metric], values[metric])
        if total is None:
            for name in DATAFLOW_METRICS:
                metrics[name] = None
        else:
            _set_values(metrics, total)
        return total

    visit(tree)
    tree["dataflow"] = {"status": signals.status, "reason": signals.reason}
    return tree


def markers_for(path: str, signals: Optional[Signals]) -> dict[str, list[dict]]:
    """Code viewer lines behind each finding: the dead guards, repeated forks and prop relays."""
    if signals is None or signals.status != "ok":
        return {}
    out: dict[str, list[dict]] = {}
    for f in signals.findings_in(path):
        marker = {"line": f["line"], "end_line": f["endLine"], "note": f"dataflow {f['rule']}: {f['message']}"}
        out.setdefault(RULE_METRIC[f["rule"]], []).append(marker)
    return out


def latest_for_file(path: Path) -> Optional[Signals]:
    """
    The saved result for the nearest folder above ``path`` that has one, when
    the file has not changed since it was computed (so the lines still match).
    """
    path = path.resolve()
    for folder in path.parents:
        hit = cached(folder)
        if hit is None:
            continue
        try:
            saved = _cache_file(folder).stat().st_mtime
            if path.stat().st_mtime > saved:
                return None
        except OSError:
            return None
        return hit
    return None
