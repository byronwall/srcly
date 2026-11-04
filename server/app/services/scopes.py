"""
One saved analysis, read at any scope: the repo or a folder, a file, or a symbol.

``explain`` answers "where should I look next?" at each step of an audit:

- a folder lists its child folders rolled up by their worst code file, then the
  worst code files anywhere below it, then what was left out and why;
- a file lists its functions and classes, worst first;
- a symbol (``file::name``) shows its line range, every measured metric
  (0 stays 0, N/A stays N/A) and the functions inside it.

Scores are the report's: one profile score per file, normalized over the whole
repo, so a file ranks the same in every scope. Paths are relative to the root.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.models import Node
from app.services import metric_catalog
from app.services.file_classes import CLASSES, classify

# A file at or above this profile score is a medium or high finding.
QUEUE_SCORE = 0.4
SYMBOL_KINDS = ("function", "class")


def rel(path: str, root: Path) -> str:
    """Tree paths are absolute under the resolved root; strip it lexically (no filesystem calls)."""
    base = str(root)
    if path == base:
        return "."
    return path[len(base) + 1 :] if path.startswith(base + "/") else path


def is_symbol(node: Node) -> bool:
    """Functions and classes; one-line lambdas are noise at every scope."""
    if node.type != "function" or node.kind not in SYMBOL_KINDS:
        return False
    return not (node.name == "(lambda)" and (node.metrics.loc or 0) <= 1)


def symbols_below(node: Node) -> list[Node]:
    """The outermost symbols under ``node``, looking through bodies, JSX and objects."""
    found: list[Node] = []
    for child in node.children:
        if is_symbol(child):
            found.append(child)
        else:
            found.extend(symbols_below(child))
    return found


def find(tree: Node, root: Path, at: str) -> Node | None:
    target = at.strip().strip("/") or "."
    if target == ".":
        return tree
    for node in _walk(tree):
        if rel(node.path, root) == target:
            return node
    return None


def _walk(node: Node):
    yield node
    for child in node.children:
        yield from _walk(child)


def explain(
    tree: Node,
    root: Path,
    at: str,
    scores: dict[str, dict[str, Any]],
    *,
    limit: int = 10,
    classes: tuple[str, ...] = ("code",),
) -> dict[str, Any]:
    """``scores`` is ``rank_nodes`` over files keyed by relative path; ``classes`` are ranked."""
    root = root.resolve()
    node = find(tree, root, at)
    if node is None:
        raise LookupError(f"{at} is not in the analysis of {root} (paths are relative to it; symbols are file::name)")
    if node.type == "folder":
        return _folder(node, root, scores, limit, classes)
    if node.type == "file":
        return _file(node, root, scores, limit)
    return _symbol(node, root, limit)


def _folder(
    node: Node, root: Path, scores: dict[str, dict[str, Any]], limit: int, classes: tuple[str, ...]
) -> dict[str, Any]:
    scope = rel(node.path, root)
    prefix = "" if scope == "." else f"{scope}/"
    files = [item for path, item in scores.items() if path.startswith(prefix)]
    code = sorted((f for f in files if f["file_class"] in classes), key=lambda f: (-f["score"], f["path"]))

    groups: dict[str, list[dict[str, Any]]] = {}
    for item in code:
        head = item["path"][len(prefix):].split("/", 1)
        # Files directly in the scope group under the scope itself, so root-level code is not lost.
        groups.setdefault(prefix + head[0] if len(head) == 2 else scope, []).append(item)
    folders = [
        {
            "path": path,
            "code_files": len(items),
            "loc": sum(int(i["metrics"].get("loc") or 0) for i in items),
            "queue": sum(1 for i in items if i["score"] >= QUEUE_SCORE),
            "worst": _brief(items[0]),
        }
        for path, items in groups.items()
    ]
    folders.sort(key=lambda f: (-f["worst"]["score"], f["path"]))

    return {
        "scope": scope,
        "kind": "folder",
        "code_files": len(code),
        "folders": folders[:limit],
        "folders_omitted": max(0, len(folders) - limit),
        "files": [_brief(item) for item in code[:limit]],
        "files_omitted": max(0, len(code) - limit),
        "classes": list(classes),
        "left_out": left_out(files, keep=classes),
    }


def left_out(files: list[dict[str, Any]], *, keep: tuple[str, ...] = ("code",)) -> list[dict[str, Any]]:
    """Every non-queued class with its count, its commonest reason and its top file."""
    out = []
    for cls in CLASSES:
        if cls in keep:
            continue
        items = sorted((f for f in files if f["file_class"] == cls), key=lambda f: (-f["score"], f["path"]))
        if not items:
            continue
        reasons: dict[str, int] = {}
        for item in items:
            reasons[item["class_reason"]] = reasons.get(item["class_reason"], 0) + 1
        out.append(
            {
                "class": cls,
                "files": len(items),
                "reason": max(reasons, key=lambda r: (reasons[r], r)),
                "top": items[0]["path"],
            }
        )
    return out


def _brief(item: dict[str, Any]) -> dict[str, Any]:
    witness = item.get("complexity_witness")
    return {
        "path": item["path"],
        "score": item["score"],
        "why": item["reason"],
        "start_at": f"{item['path']}:{witness['start_line']} {witness['name']}" if witness else item["path"],
    }


def _file(node: Node, root: Path, scores: dict[str, dict[str, Any]], limit: int) -> dict[str, Any]:
    path = rel(node.path, root)
    item = scores.get(path)
    cls, reason = classify(path)
    symbols = sorted(_all_symbols(node), key=lambda n: (-(n.metrics.complexity or 0), -(n.metrics.loc or 0), n.start_line))
    return {
        "scope": path,
        "kind": "file",
        "class": cls,
        "class_reason": reason,
        "score": item["score"] if item else None,
        "why": item["reason"] if item else None,
        "metrics": measured(node),
        "symbols": [_symbol_row(s, root) for s in symbols[:limit]],
        "symbols_omitted": max(0, len(symbols) - limit),
    }


def _all_symbols(node: Node) -> list[Node]:
    out: list[Node] = []
    for s in symbols_below(node):
        out.append(s)
        out.extend(_all_symbols(s))
    return out


def _symbol_row(node: Node, root: Path) -> dict[str, Any]:
    return {
        "symbol": rel(node.path, root),
        "lines": [node.start_line, node.end_line],
        "complexity": node.metrics.complexity,
        "loc": node.metrics.loc,
        "max_nesting_depth": node.metrics.max_nesting_depth,
    }


def _symbol(node: Node, root: Path, limit: int) -> dict[str, Any]:
    inner = sorted(_all_symbols(node), key=lambda n: (-(n.metrics.complexity or 0), n.start_line))
    return {
        "scope": rel(node.path, root),
        "kind": "symbol",
        "symbol_kind": node.kind,
        "lines": [node.start_line, node.end_line],
        "metrics": measured(node),
        "symbols": [_symbol_row(s, root) for s in inner[:limit]],
        "symbols_omitted": max(0, len(inner) - limit),
    }


def measured(node: Node) -> dict[str, Any]:
    """Every catalog metric the node has a value for. 0 is kept; risk metrics that are N/A are named."""
    values: dict[str, Any] = {}
    na: list[str] = []
    for spec in metric_catalog.METRICS:
        value = getattr(node.metrics, spec.id, None)
        if value is None:
            if spec.direction != "neutral":
                na.append(spec.id)
        elif value or spec.direction != "neutral":
            values[spec.id] = value
    return {"values": values, "na": na}


def render_markdown(payload: dict[str, Any]) -> str:
    kind, scope = payload["kind"], payload["scope"]
    lines = [f"# srcly explain {scope} ({kind})", ""]
    if kind == "folder":
        lines.append(f"{payload['code_files']} ranked files ({', '.join(payload['classes'])}). Scores are repo-wide (0–1); {QUEUE_SCORE}+ is a finding.")
        if payload["folders"]:
            lines += ["", "## Folders, worst first", "", "| Folder | Code files | LOC | Findings | Worst file | Start at |", "| --- | ---: | ---: | ---: | --- | --- |"]
            for f in payload["folders"]:
                w = f["worst"]
                label = "(files here)" if f["path"] == scope else f"{f['path']}/"
                lines.append(f"| `{label}` | {f['code_files']} | {f['loc']} | {f['queue']} | {w['score']} `{w['path']}` | `{w['start_at']}` |")
            if payload["folders_omitted"]:
                lines.append(f"| +{payload['folders_omitted']} more | | | | | |")
        lines += ["", "## Files below, worst first", "", "| Score | File | Why | Start at |", "| ---: | --- | --- | --- |"]
        for f in payload["files"]:
            lines.append(f"| {f['score']} | `{f['path']}` | {f['why']} | `{f['start_at']}` |")
        if payload["files_omitted"]:
            lines.append(f"| | +{payload['files_omitted']} more | | |")
        lines += ["", *left_out_lines(payload["left_out"])]
        sub = [f["path"] for f in payload["folders"] if f["path"] != scope]
        next_at = sub[0] if sub else (payload["files"][0]["path"] if payload["files"] else None)
    else:
        if kind == "file":
            score = f"score {payload['score']}: {payload['why']}" if payload["score"] is not None else "not scored"
            lines.append(f"Class: {payload['class']} ({payload['class_reason']}); {score}.")
        else:
            lines.append(f"{payload['symbol_kind']}, lines {payload['lines'][0]}–{payload['lines'][1]}.")
        values = ", ".join(f"{k}={_na(v)}" for k, v in payload["metrics"]["values"].items())
        lines += ["", f"Measured: {values or 'nothing'}."]
        if payload["metrics"]["na"]:
            lines.append(f"Risk metrics N/A here (not 0): {', '.join(payload['metrics']['na'])}.")
        lines += ["", "## Functions and classes, most complex first", "", "| Symbol | Lines | CCN | LOC | Nesting |", "| --- | --- | ---: | ---: | ---: |"]
        for s in payload["symbols"]:
            name = s["symbol"][len(scope) :] if s["symbol"].startswith(scope + "::") else s["symbol"]
            lines.append(f"| `{name}` | {s['lines'][0]}–{s['lines'][1]} | {_na(s['complexity'])} | {_na(s['loc'])} | {_na(s['max_nesting_depth'])} |")
        if payload["symbols_omitted"]:
            lines.append(f"| +{payload['symbols_omitted']} more | | | | |")
        next_at = payload["symbols"][0]["symbol"] if payload["symbols"] else None
    if next_at:
        lines += ["", f"Next: `srcly explain --at '{next_at}'`"]
    return "\n".join(lines) + "\n"


def left_out_lines(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return []
    parts = [f"{r['class']} {r['files']} (mostly {r['reason']}; top `{r['top']}`)" for r in rows]
    return [f"Not ranked as code: {'; '.join(parts)}. Add `--include-class <class>` to rank one."]


def _na(value: Any) -> str:
    if value is None:
        return "N/A"
    return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)
