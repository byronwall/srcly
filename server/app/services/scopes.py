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

import re
import shlex
from pathlib import Path, PurePosixPath
from typing import Any

from app.models import Node
from app.services import metric_catalog, scope_evidence
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
    """Exact scope first. ``file::name`` also finds a method or nested function by its last name
    (``file::(class) Parser::parse``) when exactly one symbol in the file has it."""
    target = at.strip().strip("/") or "."
    if target == ".":
        return tree
    line_at = _LINE_AT.match(target)
    if line_at and "::" not in target:
        return _at_line(find(tree, root, line_at["file"]), int(line_at["line"]), line_at["name"])
    target, at_sep, line = target.rpartition("@") if "::" in target and target.rpartition("@")[2].isdigit() else (target, "", "")
    exact = [node for node in _walk(tree) if rel(node.path, root) == target]
    if at_sep:
        exact = [node for node in exact if node.start_line == int(line)]
    # Two closures can share a line; @line then takes the first, which is the one the tables list.
    if len(exact) == 1 or (exact and (at_sep or exact[0].type != "function")):
        return exact[0]
    if exact:
        return None  # same-named siblings: ``_not_found`` lists each with its @line
    file, sep, name = target.partition("::")
    if sep and "::" not in name:
        parent = find(tree, root, file)
        matches = [n for n in _all_symbols(parent) if n.name == name] if parent is not None else []
        if at_sep:
            matches = [n for n in matches if n.start_line == int(line)]
        if len(matches) == 1 or (matches and at_sep):
            return matches[0]
    return None


# ``path:line`` or a whole "Start at" value (``path:line name in owner``).
_LINE_AT = re.compile(r"^(?P<file>[^:\s]+):(?P<line>\d+)(?:\s+(?P<name>\S+).*)?$")


def _at_line(file: Node | None, line: int, name: str | None = None) -> Node | None:
    """The symbol called ``name`` nearest ``line`` (the line may be stale after an edit), else the
    innermost symbol whose lines hold ``line``, else the file itself."""
    if file is None or file.type != "file":
        return None
    symbols = _all_symbols(file)
    named = [s for s in symbols if name and s.name.removeprefix("(class) ") == name]
    if named:
        return min(named, key=lambda s: (abs(s.start_line - line), s.start_line))
    holding = [s for s in symbols if s.start_line <= line <= s.end_line]
    return min(holding, key=lambda s: (s.end_line - s.start_line, -s.start_line)) if holding else file


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
        raise LookupError(_not_found(tree, root, at))
    if node.type == "folder":
        payload = _folder(node, root, scores, limit, classes)
    else:
        tests = [rel(f.path, root) for f in _walk(tree) if f.type == "file" and classify(rel(f.path, root))[0] == "test"]
        if node.type == "file":
            payload = _file(node, root, scores, limit, classes, tests)
        else:
            payload = _symbol(node, root, limit, tests)
    payload["analysis"] = provenance(tree, root)
    return payload


def provenance(tree: Node, root: Path) -> dict[str, Any]:
    """What the answer rests on: the scan (reused or fresh), the Git history and the checkers that ran."""
    info = tree._analysis
    act = tree.activity
    checks = tree.findings
    code = [f for f in _walk(tree) if f.type == "file" and classify(rel(f.path, root))[0] == "code"]
    return {
        "reused": info.reused if info else None,
        "scanned_at": info.scanned_at if info else None,
        "scan_seconds": info.scan_seconds if info else None,
        "files_failed": info.files_failed if info else tree.metrics.analysis_failed_count,
        "git": {"status": act.status, "reason": act.reason, "head": act.head, "note": act.note} if act else None,
        "checks": (
            [
                {"tool": t.tool, "label": t.label, "status": t.status, "reason": t.reason, "files_checked": t.files_checked}
                for t in checks.tools
                if t.files_checked != 0
            ]
            if checks
            else None
        ),
        "code_files": len(code),
        "code_files_unchecked": sum(1 for f in code if f.metrics.finding_count is None),
    }


def provenance_line(p: dict[str, Any]) -> str:
    """One line an agent can quote: is the scan current, what revision is history from, what was not covered."""
    if p["reused"] is None:
        scan = "scan source unknown"
    elif p["reused"]:
        scan = f"reused the scan from {p['scanned_at'].replace('T', ' ')[:16]} UTC (no file has changed since)"
    else:
        scan = f"fresh scan ({p['scan_seconds']:g} s)"
    git = p["git"]
    if not git:
        history = "Git history: not collected"
    elif git["status"] != "ok":
        history = f"Git history: N/A ({git['reason']})"
    else:
        history = f"Git history at `{git['head']}`" + (f" ({git['note']})" if git["note"] else "")
    tools = p["checks"]
    if tools is None:
        checks = "checks: not run"
    else:
        # One entry per tool: six tsconfigs read as "tsc (6 configs, 259 files)".
        groups: dict[str, list[dict[str, Any]]] = {}
        for t in tools:
            if t["status"] == "ok":
                groups.setdefault(t["label"].split(" (", 1)[0], []).append(t)
        parts = []
        for name, runs in groups.items():
            files = sum(t["files_checked"] or 0 for t in runs)
            detail = [f"{len(runs)} configs"] if len(runs) > 1 else []
            detail += [_files(files)] if files else []
            parts.append(f"{name} ({', '.join(detail)})" if detail else name)
        parts += [f"{t['label']} N/A ({t['reason']})" for t in tools if t["status"] != "ok"]
        checks = f"lint/type checks: {', '.join(parts) or 'none apply'}"
        if p["code_files_unchecked"]:
            checks += f"; {p['code_files_unchecked']} of {p['code_files']} code files have none (finding_count N/A)"
    failed = f"; {_files(p['files_failed'])} failed analysis (LOC only)" if p["files_failed"] else ""
    return f"Analysis: {scan}; {history}; {checks}{failed}."


def _files(n: int) -> str:
    return f"{n} file" if n == 1 else f"{n} files"


def _not_found(tree: Node, root: Path, at: str) -> str:
    """Name the closest valid scopes: the symbols of the file, or the analyzed root."""
    file, sep, name = at.partition("::")
    parent = find(tree, root, file) if sep else None
    if parent is not None:
        symbols = _all_symbols(parent)
        same = sorted(
            (s for s in symbols if rel(s.path, root) == at or s.name == name),
            key=lambda s: (-(s.metrics.complexity or 0), s.start_line),
        )
        if len(same) > 1:
            options = list(dict.fromkeys(f"`{_at(s, root, file, symbols)}`" for s in same))
            more = f" and {len(options) - 6} more" if len(options) > 6 else ""
            return f"{at} matches {len(same)} symbols; pick one (most complex first): {', '.join(options[:6])}{more}."
        names = [rel(s.path, root)[len(file) :] for s in symbols_below(parent)][:8]
        listed = ", ".join(f"`{n}`" for n in names) or "none"
        return f"{at} is not a function or class in {file}. Its top-level symbols: {listed}."
    return f"{at} is not in the analysis of {root}. Paths are relative to it; symbols are file::name."


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
    return {"path": item["path"], "score": item["score"], "why": item["reason"], "start_at": start_at(item)}


def start_at(item: dict[str, Any]) -> str:
    """``path:line name`` of the complexity witness; an anonymous callback also names its enclosing function."""
    witness = item.get("complexity_witness")
    if not witness:
        return item["path"]
    where = f"{item['path']}:{witness['start_line']} {witness['name']}"
    if not _named(witness["name"]):
        owner = next((part for part in reversed(witness["path"].split("::")[1:-1]) if _named(part)), None)
        if owner:
            where += f" in {owner}"
    return where


def _named(name: str) -> bool:
    """A real identifier, not ``<For>(ƒ)``, ``(anonymous)`` or ``<div>``."""
    bare = name.removeprefix("(class) ")
    return bool(bare) and bare[0] not in "<(" and "(ƒ)" not in bare


def _file(
    node: Node, root: Path, scores: dict[str, dict[str, Any]], limit: int, classes: tuple[str, ...], tests: list[str]
) -> dict[str, Any]:
    path = rel(node.path, root)
    cls, reason = classify(path)
    # A file outside the ranked classes has no score to show: it is not in the queue.
    item = scores.get(path) if cls in classes else None
    symbols = sorted(_all_symbols(node), key=lambda n: (-(n.metrics.complexity or 0), -(n.metrics.loc or 0), n.start_line))
    return {
        "scope": path,
        "kind": "file",
        "class": cls,
        "class_reason": reason,
        "score": item["score"] if item else None,
        "why": item["reason"] if item else None,
        "metrics": measured(node, path),
        "symbols": [_symbol_row(s, root, path, symbols) for s in symbols[:limit]],
        "symbols_omitted": max(0, len(symbols) - limit),
        "tests": scope_evidence.tests_naming(root, tests, module=path) if cls != "test" else None,
    }


def _all_symbols(node: Node) -> list[Node]:
    out: list[Node] = []
    for s in symbols_below(node):
        out.append(s)
        out.extend(_all_symbols(s))
    return out


def _at(node: Node, root: Path, file: str, peers: list[Node]) -> str:
    """The shortest ``--at`` that finds ``node``: ``file::name`` when the name is unique in the file,
    else its full path, else the full path ``@`` its first line."""
    if sum(1 for p in peers if p.name == node.name) == 1 and _named(node.name):
        return f"{file}::{node.name}"
    path = rel(node.path, root)
    return path if sum(1 for p in peers if p.path == node.path) == 1 else f"{path}@{node.start_line}"


def _symbol_row(node: Node, root: Path, file: str, peers: list[Node]) -> dict[str, Any]:
    return {
        "symbol": rel(node.path, root),
        "at": _at(node, root, file, peers),
        "lines": [node.start_line, node.end_line],
        "complexity": node.metrics.complexity,
        "loc": node.metrics.loc,
        "max_nesting_depth": node.metrics.max_nesting_depth,
    }


def _symbol(node: Node, root: Path, limit: int, tests: list[str]) -> dict[str, Any]:
    inner = sorted(_all_symbols(node), key=lambda n: (-(n.metrics.complexity or 0), n.start_line))
    scope = rel(node.path, root)
    file = scope.split("::", 1)[0]
    name = node.name.removeprefix("(class) ")
    return {
        "scope": scope,
        "file": file,
        "kind": "symbol",
        "symbol_kind": node.kind,
        "lines": [node.start_line, node.end_line],
        "metrics": measured(node, rel(node.path, root), symbol=True),
        "symbols": [_symbol_row(s, root, file, inner) for s in inner[:limit]],
        "symbols_omitted": max(0, len(inner) - limit),
        "branches": scope_evidence.branches(node.path.split("::", 1)[0], node.start_line, node.end_line),
        "tests": scope_evidence.tests_naming(root, tests, module=file, symbol=name) if _named(name) else None,
    }


# Metric id prefix → file suffixes it can apply to. Others apply to any source file.
_LANGUAGE_METRICS = {
    "component_": {".tsx", ".jsx"},
    "ts_": {".ts", ".tsx", ".mts", ".cts"},
    "python_": {".py"},
    "md_": {".md", ".mdx"},
}
# Measured once per file (history, checkers, rollups), never per function.
_FILE_ONLY = {"commit_count", "churn_lines", "finding_count", "error_count", "complexity_avg", "average_function_length"}


def _applies(metric: str, suffix: str, symbol: bool) -> bool:
    if symbol and metric in _FILE_ONLY:
        return False
    for prefix, suffixes in _LANGUAGE_METRICS.items():
        if metric.startswith(prefix):
            return suffix in suffixes
    return suffix not in {".md", ".mdx"}


def measured(node: Node, path: str, *, symbol: bool = False) -> dict[str, Any]:
    """Every catalog metric the node has a value for (0 is kept), and the risk metrics that
    could apply to this language but are N/A here."""
    suffix = PurePosixPath(path.split("::", 1)[0]).suffix.lower()
    values: dict[str, Any] = {}
    na: list[str] = []
    for spec in metric_catalog.METRICS:
        if spec.id == "file_count":
            continue
        value = getattr(node.metrics, spec.id, None)
        if value is None:
            if spec.direction != "neutral" and _applies(spec.id, suffix, symbol):
                na.append(spec.id)
        elif value or spec.direction != "neutral":
            values[spec.id] = value
    return {"values": values, "na": na}


def render_markdown(payload: dict[str, Any], *, command: str = "srcly explain") -> str:
    """``command`` is how the user ran it (with the root argument), so the Next line runs as-is."""
    kind, scope = payload["kind"], payload["scope"]
    lines = [f"# srcly explain {scope} ({kind})", ""]
    next_at = next_line = None
    if kind == "folder":
        ranked = ", ".join(payload["classes"])
        if not payload["files"]:
            lines.append(f"No {ranked} files here.")
            hint = max(payload["left_out"], key=lambda r: r["files"], default=None)
            if hint:
                lines.append(f"Rank the {hint['files']} {hint['class']} files with `--include-class {hint['class']}`.")
            lines += ["", *left_out_lines(payload["left_out"])] if payload["left_out"] else []
            lines += ["", provenance_line(payload["analysis"])] if payload.get("analysis") else []
            return "\n".join(lines).rstrip() + "\n"
        lines.append(
            f"{payload['code_files']} ranked files ({ranked}). Score: the profile's weighted mix of complexity, size, "
            f"nesting and history, 1.0 = the repo's worst; {QUEUE_SCORE}+ is a finding. "
            "Pass any \"start at\" value to `--at`."
        )
        folders = payload["folders"]
        if folders and not (len(folders) == 1 and folders[0]["path"] == scope):
            lines += ["", "## Folders, worst first", "", "| Folder | Files | LOC | Findings | Worst | Its worst file: start at |", "| --- | ---: | ---: | ---: | ---: | --- |"]
            for f in folders:
                w = f["worst"]
                label = "(files here)" if f["path"] == scope else f"{f['path']}/"
                lines.append(f"| `{label}` | {f['code_files']} | {f['loc']} | {f['queue']} | {w['score']} | `{w['start_at']}` |")
            if payload["folders_omitted"]:
                lines.append(f"| +{payload['folders_omitted']} more | | | | | |")
        lines += ["", "## Files below, worst first", "", "| Score | Start at | Why |", "| ---: | --- | --- |"]
        for f in payload["files"]:
            lines.append(f"| {f['score']} | `{f['start_at']}` | {f['why']} |")
        if payload["files_omitted"]:
            lines.append(f"| | +{payload['files_omitted']} more | |")
        lines += ["", *left_out_lines(payload["left_out"])]
        sub = [f["path"] for f in folders if f["path"] != scope]
        next_at = sub[0] if sub else payload["files"][0]["path"]
    else:
        if kind == "file":
            if payload["score"] is not None:
                standing = f"score {payload['score']}: {payload['why']}"
            else:
                standing = f"not ranked ({payload['class']} files are left out of the queue)"
            lines.append(f"Class: {payload['class']} ({payload['class_reason']}); {standing}.")
        else:
            start, end = payload["lines"]
            where = f"line {start}" if start == end else f"lines {start}–{end}"
            lines.append(f"{payload['symbol_kind']}, {where}.")
        rollup = _ROLLUP if kind == "file" else {}
        values = ", ".join(f"{k}={_na(v)}{rollup.get(k, '')}" for k, v in payload["metrics"]["values"].items())
        lines += ["", f"Measured: {values or 'nothing'}."]
        if payload["metrics"]["na"]:
            lines.append(f"N/A here (not 0): {', '.join(payload['metrics']['na'])}.")
        if payload.get("branches"):
            lines += ["", scope_evidence.branches_line(payload["branches"])]
        if payload.get("tests"):
            lines += ["", scope_evidence.tests_line(payload["tests"])]
        if payload["symbols"]:
            lines += ["", "## Functions and classes, most complex first", "", "| Symbol | Lines | CCN | LOC | Nesting |", "| --- | --- | ---: | ---: | ---: |"]
            for s in payload["symbols"]:
                name = s["symbol"][len(scope) :] if s["symbol"].startswith(scope + "::") else s["symbol"]
                start, end = s["lines"]
                span = f"{start}" if start == end else f"{start}–{end}"
                lines.append(f"| `{name}` | {span} | {_na(s['complexity'])} | {_na(s['loc'])} | {_na(s['max_nesting_depth'])} |")
            if payload["symbols_omitted"]:
                lines.append(f"| +{payload['symbols_omitted']} more | | | | |")
        else:
            lines += ["", "No functions or classes inside."]
        if kind == "symbol":
            # The function itself is the next thing to read, not its smallest closure.
            start, end = payload["lines"]
            next_line = f"Next: read it with `sed -n '{start},{end}p' {shlex.quote(payload['file'])}`"
        elif payload["symbols"]:
            next_at = payload["symbols"][0]["at"]
    if payload.get("analysis"):
        lines += ["", provenance_line(payload["analysis"])]
    if next_at:
        next_line = f"Next: `{command} --at {shlex.quote(next_at)}`"
    if next_line:
        lines += ["", next_line]
    return "\n".join(lines) + "\n"


def left_out_lines(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return []
    parts = [f"{r['class']} {r['files']} (mostly {r['reason']}; top `{r['top']}`)" for r in rows]
    return [f"Not ranked as code: {'; '.join(parts)}. Add `--include-class <class>` to rank one."]


# File values that roll up from its functions, labeled so a sum is not read as one function's value.
_ROLLUP = {
    "complexity": " (worst function)",
    "max_nesting_depth": " (deepest function)",
    "parameter_count": " (sum over functions)",
    "complexity_avg": " (mean per function)",
    "average_function_length": " (mean per function)",
}


def _na(value: Any) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:.2f}".rstrip("0")
    return str(value)
