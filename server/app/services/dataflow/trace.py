"""
``srcly trace`` and ``srcly impact``: the data-flow engine from a terminal.

The CLI starts the engine itself (no web server), anchors at a symbol or a
position, and prints the engine's own answer as compact markdown: origins,
ends, a short path per pair, every stop, and the functions crossed. The status
is always printed; ``ok`` means proven. Nothing here adds facts the engine did
not give.
"""

from __future__ import annotations

import heapq
import json
import re
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from app.services.dataflow.engine import EngineError, EngineRegistry

TS_SUFFIXES = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
TS_ROOT_FILES = ("tsconfig.json", "jsconfig.json", "package.json")
PY_ROOT_FILES = ("pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "manage.py")
# A path longer than this inside one function folds to its first and last steps.
FOLD_STEPS = 6
# The web view folds a function at 40 boxes.
FOLD_BOXES = 40
STOP_KINDS = ("boundary", "frontier")


class TraceError(Exception):
    """A failure the CLI prints and exits on. ``status`` 2 is an ambiguous or bad request, 1 any other."""

    def __init__(self, message: str, status: int = 1):
        super().__init__(message)
        self.message = message
        self.status = status


# -- where to run ---------------------------------------------------------------


def parse_target(text: str) -> tuple[Path, Optional[int], Optional[int]]:
    """``path[:line[:col]]``."""
    match = re.match(r"^(.*?)(?::(\d+))?(?::(\d+))?$", text)
    assert match
    line = int(match[2]) if match[2] else None
    col = int(match[3]) if match[3] else None
    return Path(match[1]).resolve(), line, col


def language_of(file: Path) -> str:
    if file.suffix == ".py":
        return "python"
    if file.name.endswith(TS_SUFFIXES) and not file.name.endswith(".d.ts"):
        return "typescript"
    raise TraceError(f"{file.name}: unsupported language. Trace reads TypeScript, TSX, JavaScript and Python files.")


def find_root(file: Path, root: Optional[str]) -> Path:
    """``--root``, else the nearest folder above ``file`` with a project file for its language."""
    if root:
        found = Path(root).resolve()
        if not file.is_relative_to(found):
            raise TraceError(f"{file} is outside --root {found}")
        return found
    names = PY_ROOT_FILES if file.suffix == ".py" else TS_ROOT_FILES
    for folder in file.parents:
        if any((folder / name).is_file() for name in names):
            return folder
    raise TraceError(f"{file} is outside a project: no {' or '.join(names)} in a folder above it. Pass --root.")


class Session:
    """One engine for one root, closed on exit."""

    def __init__(self, root: Path, language: str):
        self.root = root
        self.registry = EngineRegistry()
        found = self.registry.probe(root)
        if not found.available:
            raise TraceError(f"Data flow not analyzed ({found.reason}): {found.message}")
        if found.language != language:
            raise TraceError(
                f"{root} is analyzed as {found.language}, but the file is {language}. Pass --root with the file's own project folder."
            )

    def query(self, op: str, params: dict) -> dict:
        try:
            return self.registry.query(self.root, op, params)
        except EngineError as exc:
            raise TraceError(f"Data flow not analyzed ({exc.code}): {exc.message}") from None

    def close(self) -> None:
        self.registry.close_all()


def progress(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


# -- declarations by name (tree-sitter) -------------------------------------------


@dataclass
class Decl:
    name: str
    kind: str
    line: int
    column: int


def _parser(file: Path):
    from tree_sitter import Parser

    if file.suffix == ".py":
        from app.services.python.python_analysis import PYTHON_LANGUAGE

        return Parser(PYTHON_LANGUAGE)
    from app.services.typescript.typescript_analysis import TSX_LANGUAGE, TYPESCRIPT_LANGUAGE

    return Parser(TSX_LANGUAGE if file.suffix in (".tsx", ".jsx", ".js", ".mjs", ".cjs") else TYPESCRIPT_LANGUAGE)


def _walk(node) -> Iterable[Any]:
    stack = [node]
    while stack:
        item = stack.pop()
        yield item
        stack.extend(reversed(item.children))


def _inside(node, types: tuple[str, ...]) -> bool:
    parent = node.parent
    while parent is not None:
        if parent.type in types:
            return True
        parent = parent.parent
    return False


def _ts_kind(node) -> Optional[str]:
    parent = node.parent
    if parent is None:
        return None
    ptype = parent.type
    if ptype in ("function_declaration", "generator_function_declaration") and parent.child_by_field_name("name") == node:
        return "function"
    if ptype in ("class_declaration", "abstract_class_declaration") and parent.child_by_field_name("name") == node:
        return "class"
    if ptype == "method_definition" and parent.child_by_field_name("name") == node:
        return "method"
    if ptype == "public_field_definition" and parent.child_by_field_name("name") == node:
        return "field"
    if ptype == "property_signature" and parent.child_by_field_name("name") == node:
        return "type member"
    if ptype == "variable_declarator" and parent.child_by_field_name("name") == node:
        value = parent.child_by_field_name("value")
        return "function" if value is not None and value.type in ("arrow_function", "function_expression", "function") else "variable"
    if ptype in ("required_parameter", "optional_parameter") and parent.child_by_field_name("pattern") == node:
        return "parameter"
    if ptype == "arrow_function" and parent.child_by_field_name("parameter") == node:
        return "parameter"
    if node.type == "shorthand_property_identifier_pattern" or (ptype == "pair_pattern" and parent.child_by_field_name("value") == node):
        return "parameter" if _inside(node, ("formal_parameters",)) else "variable"
    if ptype == "array_pattern":
        return "parameter" if _inside(node, ("formal_parameters",)) else "variable"
    return None


def _py_kind(node) -> Optional[str]:
    parent = node.parent
    if parent is None:
        return None
    ptype = parent.type
    in_class = parent.parent is not None and parent.parent.type == "block" and _inside(parent, ("class_definition",))
    if ptype == "function_definition" and parent.child_by_field_name("name") == node:
        return "method" if in_class else "function"
    if ptype == "class_definition" and parent.child_by_field_name("name") == node:
        return "class"
    if ptype == "parameters" or (ptype in ("typed_parameter", "default_parameter", "typed_default_parameter") and parent.children[0] == node):
        return "parameter"
    if ptype == "assignment" and parent.child_by_field_name("left") == node:
        owner = parent.parent.parent if parent.parent is not None else None
        if owner is not None and owner.type == "block" and owner.parent is not None and owner.parent.type == "class_definition":
            return "field"
        return "variable"
    if ptype == "attribute" and parent.child_by_field_name("attribute") == node:
        grand = parent.parent
        if grand is not None and grand.type == "assignment" and grand.child_by_field_name("left") == parent:
            return "field"
    return None


def declarations(file: Path, name: Optional[str] = None) -> list[Decl]:
    """Where ``name`` (or any name) is declared in ``file``: functions, classes, methods, fields, variables, parameters."""
    source = file.read_bytes()
    tree = _parser(file).parse(source)
    python = file.suffix == ".py"
    found: dict[tuple[int, str], Decl] = {}
    for node in _walk(tree.root_node):
        if node.type not in ("identifier", "property_identifier", "type_identifier", "shorthand_property_identifier_pattern"):
            continue
        text = node.text.decode("utf-8", "replace")
        if name is not None and text != name:
            continue
        kind = _py_kind(node) if python else _ts_kind(node)
        if kind is None or (name is None and kind == "type member"):
            continue
        line = node.start_point[0] + 1
        # One declaration per name and line: `const f = () => …` is one function.
        found.setdefault((line, text), Decl(text, kind, line, node.start_point[1] + 1))
    return sorted(found.values(), key=lambda d: (d.line, d.column))


def member_reads(file: Path, name: str) -> list[tuple[int, int, int, str]]:
    """Every ``x.name`` (``x?.name``) in a TypeScript file: (line, start col, end col, text) for a field with no declaration evidence."""
    source = file.read_bytes()
    tree = _parser(file).parse(source)
    out = []
    for node in _walk(tree.root_node):
        if node.type != "member_expression":
            continue
        prop = node.child_by_field_name("property")
        if prop is None or prop.text.decode() != name or node.start_point[0] != node.end_point[0]:
            continue
        out.append((node.start_point[0] + 1, node.start_point[1] + 1, node.end_point[1] + 1, node.text.decode()))
    return out


# -- anchoring ------------------------------------------------------------------


@dataclass
class Anchor:
    params: dict
    """The ``anchorGraph`` params without the direction."""
    title: str


def ambiguous(file: Path, name: str, found: list[Decl], command: str) -> TraceError:
    lines = [f"`{name}` is declared {len(found)} times in {file.name}. Pick one with a line:", ""]
    lines += [f"- {d.kind} `{d.name}` line {d.line}: `{command} {file}:{d.line} --symbol {d.name}`" for d in found]
    return TraceError("\n".join(lines), status=2)


def resolve(session: Session, file: Path, rel: str, line: Optional[int], col: Optional[int], symbol: Optional[str], command: str) -> Anchor:
    """The anchor for a symbol (by name, with or without a line) or a position."""
    if symbol and line:
        return Anchor({"file": rel, "name": symbol, "line": line}, f"{symbol} ({rel}:{line})")
    if line and col:
        caret = {"startLine": line, "startColumn": col, "endLine": line, "endColumn": col}
        picked = session.query("selectExpression", {"file": rel, "span": caret})
        candidates = [c for c in picked.get("candidates") or [] if c.get("evidence")]
        if not candidates:
            raise TraceError(f"No traceable expression at {rel}:{line}:{col} ({picked.get('reason') or 'no evidence'}).")
        best = candidates[0]
        return Anchor({"file": rel, "span": best["span"], "text": best["text"]}, f"`{best['text']}` ({rel}:{line}:{best['span']['startColumn']})")
    if symbol:
        found = declarations(file, symbol)
        if not found:
            raise TraceError(f"No declaration of `{symbol}` in {rel}. Pass a line (`{rel}:<line> --symbol {symbol}`) to anchor a use.")
        if len(found) > 1:
            raise ambiguous(file, symbol, found, command)
        decl = found[0]
        return Anchor({"file": rel, "name": decl.name, "line": decl.line}, f"{decl.kind} {decl.name} ({rel}:{decl.line})")
    if line:
        found = [d for d in declarations(file) if d.line == line]
        if len(found) == 1:
            decl = found[0]
            return Anchor({"file": rel, "name": decl.name, "line": decl.line}, f"{decl.kind} {decl.name} ({rel}:{decl.line})")
        names = ", ".join(f"`{d.name}` ({d.kind})" for d in found) or "nothing"
        raise TraceError(f"Line {line} declares {names}. Pass --symbol NAME or a column ({rel}:{line}:<col>).", status=2)
    raise TraceError("Pass --symbol NAME, or a position as path:line:col.", status=2)


# -- reading a graph ------------------------------------------------------------


class Graph:
    def __init__(self, result: dict):
        self.result = result
        self.nodes = {n["id"]: n for n in result.get("nodes") or []}
        self.out: dict[str, list[dict]] = {}
        self.into: dict[str, list[dict]] = {}
        for edge in result.get("edges") or []:
            self.out.setdefault(edge["source"], []).append(edge)
            self.into.setdefault(edge["target"], []).append(edge)
        self.anchor = next((n["id"] for n in self.nodes.values() if n["kind"] == "anchor"), None)

    def boxes(self) -> list[dict]:
        return [n for n in self.nodes.values() if n["kind"] != "scope"]

    def origins(self) -> list[dict]:
        """The engine's origins, then upstream boxes nothing flows into (a literal, a parameter no caller fills)."""
        named = [n for n in self.boxes() if n["kind"] == "origin"]
        leaves = [
            n for n in self.boxes()
            if n["side"] == "up" and n["kind"] in ("value", "transform", "control") and not self.into.get(n["id"]) and self.out.get(n["id"])
        ]
        return named + leaves

    def ends(self) -> list[dict]:
        """The engine's terminals, then downstream boxes that flow nowhere (a return no caller reads)."""
        named = [n for n in self.boxes() if n["kind"] == "terminal"]
        leaves = [
            n for n in self.boxes()
            if n["side"] == "down" and n["kind"] in ("value", "transform", "control") and not self.out.get(n["id"]) and n.get("elementKind") == "return"
        ]
        return named + leaves

    def stops(self) -> list[dict]:
        return [n for n in self.boxes() if n["kind"] in STOP_KINDS]

    def scopes(self) -> list[dict]:
        return [n for n in self.nodes.values() if n["kind"] == "scope"]

    def reach(self, start: str) -> set[str]:
        seen = {start}
        queue = deque([start])
        while queue:
            for edge in self.out.get(queue.popleft(), []):
                if edge["target"] not in seen:
                    seen.add(edge["target"])
                    queue.append(edge["target"])
        return seen

    def path(self, start: str, end: str) -> Optional[list[tuple[Optional[dict], str]]]:
        """The drawn route as (incoming edge, node id) steps, or None. A structural link costs more than a traced one."""
        best = {start: 0}
        back: dict[str, tuple[str, dict]] = {}
        heap = [(0, 0, start)]
        tick = 0
        while heap:
            cost, _, current = heapq.heappop(heap)
            if current == end:
                break
            if cost > best.get(current, cost):
                continue
            for edge in self.out.get(current, []):
                step = cost + (5 if edge["status"] == "structural" else 1)
                if step < best.get(edge["target"], step + 1):
                    best[edge["target"]] = step
                    back[edge["target"]] = (current, edge)
                    tick += 1
                    heapq.heappush(heap, (step, tick, edge["target"]))
        if end not in best:
            return None
        steps: list[tuple[Optional[dict], str]] = []
        node = end
        while node != start:
            prev, via = back[node]
            steps.append((via, node))
            node = prev
        steps.append((None, start))
        return list(reversed(steps))

    def hops(self) -> dict[str, int]:
        """Undirected distance of each box from the anchor."""
        if self.anchor is None:
            return {}
        dist = {self.anchor: 0}
        queue = deque([self.anchor])
        while queue:
            current = queue.popleft()
            for edge in self.out.get(current, []) + self.into.get(current, []):
                other = edge["target"] if edge["source"] == current else edge["source"]
                if other not in dist:
                    dist[other] = dist[current] + 1
                    queue.append(other)
        return dist


def where(node: dict) -> str:
    return f"{node['file']}:{node['line']}"


def clip(text: str, size: int = 70) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= size else text[: size - 1] + "…"


def kind_of(node: dict) -> str:
    return node.get("elementKind") or node.get("detail") or node["kind"]


def _capped(items: list, limit: int, render, noun: str) -> list[str]:
    lines = [render(item) for item in items[:limit]]
    if len(items) > limit:
        lines.append(f"- … {len(items) - limit} more {noun} (see `--format json`)")
    return lines


def _step_lines(graph: Graph, steps: list[tuple[Optional[dict], str]]) -> list[str]:
    rows = []
    for edge, node_id in steps:
        node = graph.nodes[node_id]
        op = node["kind"] if edge is None else edge["kind"] + (f" .{edge['label']}" if edge.get("label") else "")
        if edge is not None and edge["status"] not in ("proven", "structural"):
            op += f" ({edge['status']})"
        rows.append((node.get("parent"), f"    {where(node)}  {op}  {clip(node['label'], 60)}"))
    # Fold a long run inside one function to its first and last steps.
    out: list[str] = []
    i = 0
    while i < len(rows):
        j = i
        while j < len(rows) and rows[j][0] == rows[i][0]:
            j += 1
        run = rows[i:j]
        if len(run) > FOLD_STEPS:
            scope = graph.nodes.get(run[0][0] or "", {}).get("label", "?")
            out += [r[1] for r in run[:2]] + [f"    … {len(run) - 4} steps in {scope}"] + [r[1] for r in run[-2:]]
        else:
            out += [r[1] for r in run]
        i = j
    return out


def status_line(result: dict) -> str:
    budget = (result.get("coverage") or {}).get("budget") or {}
    parts = [f"status `{result['outcome']}`"]
    if result.get("reason"):
        parts.append(f"reason `{result['reason']}`")
    parts.append(f"null-proof {'yes' if result.get('nullProof') else 'no'}")
    if budget.get("exhausted"):
        parts.append(f"budget exhausted ({budget.get('used')}/{budget.get('limit')})")
    return " · ".join(parts)


def render_trace(result: dict, title: str, limit: int, depth: Optional[int]) -> str:
    graph = Graph(result)
    anchor = result.get("anchor") or {}
    lines = [f"# Trace {title}", ""]
    lines.append(f"- anchor `{clip(anchor.get('text', ''), 80)}` {anchor.get('file')}:{(anchor.get('span') or {}).get('startLine')} ({anchor.get('typeText') or anchor.get('kind')})")
    lines.append(f"- direction {result.get('direction')} · {status_line(result)}")
    if result["outcome"] in ("unsupported", "not-analyzed", "budget"):
        anchor_node = graph.nodes.get(graph.anchor or "", {})
        lines.append(f"- not traced: {anchor_node.get('note') or result.get('reason') or result['outcome']}")
        return "\n".join(lines) + "\n"
    dist = graph.hops()
    hidden = 0

    def keep(items: list[dict]) -> list[dict]:
        nonlocal hidden
        if depth is None:
            return items
        near = [n for n in items if dist.get(n["id"], 0) <= depth]
        hidden += len(items) - len(near)
        return near

    origins, ends, stops = keep(graph.origins()), keep(graph.ends()), keep(graph.stops())
    row = lambda n: f"- {kind_of(n)} `{clip(n['label'])}` {where(n)}" + ("" if n["status"] == "proven" else f" ({n['status']})")  # noqa: E731
    lines += ["", f"## Origins ({len(origins)})"]
    lines += _capped(origins, limit, row, "origins") or ["- none drawn"]
    lines += ["", f"## Ends ({len(ends)})"]
    lines += _capped(ends, limit, row, "ends") or ["- none drawn"]

    pairs = [(o["id"], e["id"]) for o in (origins or [graph.nodes[graph.anchor]]) for e in (ends or [graph.nodes[graph.anchor]]) if o["id"] != e["id"]]
    lines += ["", f"## Paths ({len(pairs)})"]
    for start, end in pairs[:limit]:
        first = graph.path(start, graph.anchor) if graph.anchor else None
        second = graph.path(graph.anchor, end) if graph.anchor else None
        if first is None or second is None:
            direct = graph.path(start, end)
            steps = direct
        else:
            steps = first + second[1:]
        lines.append(f"- {clip(graph.nodes[start]['label'], 40)} → {clip(graph.nodes[end]['label'], 40)}")
        lines += _step_lines(graph, steps) if steps else ["    no drawn route joins them"]
    if len(pairs) > limit:
        lines.append(f"- … {len(pairs) - limit} more pairs (see `--format json`)")

    lines += ["", f"## Stops ({len(stops)})"]
    stop_row = lambda n: f"- {n.get('reason') or n['kind']} at {where(n)} `{clip(n['label'], 50)}`: {clip(n.get('note') or '', 160)}"  # noqa: E731
    lines += _capped(stops, limit, stop_row, "stops") or ["- none"]

    scopes = graph.scopes()
    counts: dict[str, int] = {}
    for n in graph.boxes():
        counts[n.get("parent") or ""] = counts.get(n.get("parent") or "", 0) + 1
    lines += ["", f"## Functions crossed ({len(scopes)})"]
    scope_row = lambda s: f"- {s.get('role') or 'function'} `{s['label']}` {where(s)} ({counts.get(s['id'], 0)} boxes{', folded' if counts.get(s['id'], 0) > FOLD_BOXES else ''})"  # noqa: E731
    lines += _capped(scopes, limit, scope_row, "functions")
    if hidden:
        lines += ["", f"_{hidden} origins, ends or stops are past --depth {depth} and hidden._"]
    return "\n".join(lines) + "\n"


# -- effects --------------------------------------------------------------------

FAMILY_TITLES = [("input", "Reads"), ("write", "Writes"), ("external", "Calls out"), ("throw", "Throws"), ("timer", "Timers"), ("promise", "Promises")]


def render_effects(result: dict, limit: int) -> str:
    callable_ = result.get("callable") or {}
    head = f"## {callable_.get('kind', 'function')} `{callable_.get('name')}` {callable_.get('file')}:{callable_.get('line')}"
    lines = [head, ""]
    if result["outcome"] in ("unsupported", "not-analyzed"):
        return "\n".join(lines + [f"- not analyzed: {result.get('reason') or result['outcome']}", ""])
    facts, frontiers = result.get("facts") or [], result.get("frontiers") or []
    complete = result.get("coverage") == "complete-for-supported-scope"
    if facts:
        pure = "no"
    elif complete:
        pure = "yes (no effect found, no frontier)"
    else:
        pure = f"not proven ({len(frontiers)} frontiers)"
    lines.append(f"- status `{result['outcome']}` · coverage `{result.get('coverage')}` · pure: {pure}{' · async' if callable_.get('async') else ''}")
    for family, title in FAMILY_TITLES:
        own = [f for f in facts if f["family"] == family]
        if not own:
            continue
        lines.append(f"- {title} ({len(own)}):")
        row = lambda f: f"  - {f['kind']} `{clip(f['label'], 60)}` {f['witness']['file']}:{f['witness']['line']}" + (  # noqa: E731
            f" via {' → '.join(v['callable'] for v in f['via'])}" if f["via"] else ""
        ) + ("" if f["status"] == "proven" else " (partial: named by syntax)") + ("" if f["activation"] == "direct" else f" [{f['activation']}]")
        lines += [("  " + item) if item.startswith("- …") else item for item in _capped(own, limit, row, title.lower())]
    handling = result.get("resultHandling") or []
    if handling:
        lines.append(f"- Promise handling ({len(handling)}): " + ", ".join(f"`{clip(h['callee'], 30)}` {h['handling']} ({h['witness']['line']})" for h in handling[:limit]))
    if frontiers:
        lines.append(f"- Not followed ({len(frontiers)}):")
        row = lambda f: f"  - {f['reason']} `{clip(f['label'], 60)}` {f['witness']['file']}:{f['witness']['line']}"  # noqa: E731
        lines += _capped(frontiers, limit, row, "frontiers")
    if not facts and not frontiers:
        lines.append("- no effects found")
    return "\n".join(lines) + "\n"


def run_effects(session: Session, file: Path, rel: str, line: Optional[int], col: Optional[int], symbol: Optional[str], limit: int, command: str) -> tuple[str, Any]:
    targets: list[tuple[int, Optional[int]]] = []
    if line:
        targets = [(line, col)]
    elif symbol:
        found = [d for d in declarations(file, symbol) if d.kind in ("function", "method")]
        if not found:
            raise TraceError(f"No function or method named `{symbol}` in {rel}.")
        if len(found) > 1:
            raise ambiguous(file, symbol, found, command + " --effects")
        targets = [(found[0].line, found[0].column)]
    else:
        targets = [(d.line, d.column) for d in declarations(file) if d.kind in ("function", "method")]
        if not targets:
            raise TraceError(f"No functions in {rel}.")
    results, seen = [], set()
    for at_line, at_col in targets:
        progress(f"effects at {rel}:{at_line}")
        result = session.query("functionEffects", {"file": rel, "line": at_line, **({"column": at_col} if at_col else {})})
        span = json.dumps((result.get("callable") or {}).get("span"), sort_keys=True)
        if span in seen:
            continue
        seen.add(span)
        results.append(result)
    text = f"# Effects in {rel}\n\n" + "\n".join(render_effects(r, limit) for r in results)
    return text, results


# -- impact ---------------------------------------------------------------------


def _ends_from(graph: Graph, starts: Iterable[str]) -> tuple[list[dict], list[dict]]:
    """Ends and stops reachable from ``starts``."""
    seen: set[str] = set()
    for start in starts:
        seen |= graph.reach(start)
    ends_ids = {n["id"] for n in graph.ends()}
    ends = [graph.nodes[i] for i in seen if i in ends_ids]
    stops = [graph.nodes[i] for i in seen if graph.nodes[i]["kind"] in STOP_KINDS]
    return sorted(ends, key=where), sorted(stops, key=where)


def render_impact_function(graph: Graph, title: str, limit: int) -> str:
    result = graph.result
    ok = result["outcome"] == "ok"
    lines = [f"# Impact of {title}", "", f"- {status_line(result)}"]
    params = [graph.nodes[e["target"]] for e in graph.out.get(graph.anchor, []) if e["kind"] == "parameter"]
    returns = [graph.nodes[e["target"]] for e in graph.out.get(graph.anchor, []) if e["kind"] == "returns"]
    calls = [graph.nodes[e["target"]] for e in graph.out.get(graph.anchor, []) if e["kind"] == "used-by"]
    check: dict[str, str] = {}
    safe: list[str] = []
    unproven: list[str] = []
    row = lambda n: f"  - {kind_of(n)} `{clip(n['label'])}` {where(n)}" + ("" if n["status"] == "proven" else f" ({n['status']})")  # noqa: E731

    lines += ["", f"## Parameters ({len(params)})"]
    for param in params:
        ends, stops = _ends_from(graph, [param["id"]])
        fields = sorted({e.get("label") for e in graph.into.get(param["id"], []) + graph.out.get(param["id"], []) if e["kind"] == "prop-read" and e.get("label")})
        fields = sorted(set(fields) | {n["field"] for n in graph.boxes() if param.get("symbol") and n.get("symbol") == param["symbol"] and n.get("field")})
        lines.append(f"- `{param['label']}` ({param.get('typeText') or '?'}): {len(ends)} ends, {len(stops)} stops")
        if fields:
            lines.append(f"  - fields read: {', '.join(f'`{f}`' for f in fields)} (a caller may stop passing the others)")
        lines += _capped(ends, limit, row, "ends")
        for n in ends:
            check[where(n)] = f"{kind_of(n)} `{clip(n['label'], 50)}`"
        for n in stops:
            unproven.append(f"parameter `{param['label']}`: {n.get('reason')} at {where(n)} `{clip(n['label'], 50)}`")
        if ok and not ends and not stops and not fields:
            safe.append(f"parameter `{param['label']}`: the body reads it nowhere")

    lines += ["", f"## Return ({len(returns)} return statements, {len(calls)} call sites)"]
    ret_ends, ret_stops = _ends_from(graph, [c["id"] for c in calls])
    lines += [f"- reaches {len(ret_ends)} ends in callers:"] + _capped(ret_ends, limit, row, "ends")
    for n in ret_ends:
        check[where(n)] = f"{kind_of(n)} `{clip(n['label'], 50)}`"
    for n in ret_stops:
        unproven.append(f"return: {n.get('reason')} at {where(n)} `{clip(n['label'], 50)}`")
    if ok and calls and not ret_ends and not ret_stops:
        safe.append("return value: no caller's result reaches an end")

    by_file: dict[str, list[str]] = {}
    for call in calls:
        scope = graph.nodes.get(call.get("parent") or "", {})
        by_file.setdefault(call["file"], []).append(f"{scope.get('label', '?')}:{call['line']}")
        check[where(call)] = f"call `{clip(call['label'], 50)}`"
    lines += ["", f"## Callers ({len(calls)})"]
    lines += [f"- {file}: {', '.join(sites)}" for file, sites in sorted(by_file.items())] or ["- none drawn"]
    for n in graph.stops():
        text = f"{n.get('reason')} at {where(n)} `{clip(n['label'], 50)}`"
        if not any(text in u for u in unproven):
            unproven.append(text)
    return "\n".join(lines + _verdict(result, check, safe, unproven, limit)) + "\n"


def _verdict(result: dict, check: dict[str, str], safe: list[str], unproven: list[str], limit: int) -> list[str]:
    lines = ["", "## Verdict"]
    if result["outcome"] != "ok":
        unproven.insert(0, f"the trace is `{result['outcome']}`, not `ok`: nothing below is safe by proof")
        safe = []
    lines.append(f"- Safe to change ({len(safe)}):")
    lines += [f"  - {s}" for s in safe] or ["  - nothing proven safe"]
    items = sorted(check.items())
    lines.append(f"- Check these {len(items)} places:")
    lines += [f"  - {at} {what}" for at, what in items[: limit * 2]]
    if len(items) > limit * 2:
        lines.append(f"  - … {len(items) - limit * 2} more (see `--format json`)")
    lines.append(f"- Not proven ({len(unproven)}):")
    lines += [f"  - {u}" for u in unproven[: limit * 2]] or ["  - none"]
    if len(unproven) > limit * 2:
        lines.append(f"  - … {len(unproven) - limit * 2} more")
    return lines


def render_impact_value(graphs: list[tuple[str, Graph]], title: str, limit: int) -> str:
    """A field, prop or variable: who writes it (upstream) and who reads it (downstream), across one or more read sites."""
    lines = [f"# Impact of {title}", ""]
    check: dict[str, str] = {}
    unproven: list[str] = []
    writers: dict[str, str] = {}
    readers: dict[str, str] = {}
    worst = "ok"
    order = ["ok", "assumed", "partial", "unsupported", "budget", "not-analyzed"]
    for site, graph in graphs:
        result = graph.result
        lines.append(f"- {site}: {status_line(result)}")
        if result["outcome"] not in order or order.index(result["outcome"]) > order.index(worst):
            worst = result["outcome"]
        for n in graph.origins():
            writers[where(n)] = f"{kind_of(n)} `{clip(n['label'], 50)}`"
        for n in graph.boxes():
            if n["side"] == "up" and any(k in (n.get("elementKind") or "") for k in ("binding", "assignment", "write", "pack")):
                writers[where(n)] = f"{kind_of(n)} `{clip(n['label'], 50)}`"
        for n in graph.ends():
            readers[where(n)] = f"{kind_of(n)} `{clip(n['label'], 50)}`"
        for n in graph.stops():
            unproven.append(f"{n.get('reason')} at {where(n)} `{clip(n['label'], 50)}`")
    lines += ["", f"## Writers ({len(writers)})"] + [f"- {at} {what}" for at, what in sorted(writers.items())[:limit]]
    if not writers:
        lines.append("- none drawn")
    lines += ["", f"## Readers ({len(readers)})"] + [f"- {at} {what}" for at, what in sorted(readers.items())[:limit]]
    if not readers:
        lines.append("- none drawn")
    check.update(writers)
    check.update(readers)
    return "\n".join(lines + _verdict({"outcome": worst}, check, [], unproven, limit)) + "\n"


def run_impact(session: Session, file: Path, rel: str, anchor: Anchor, limit: int) -> tuple[str, Any]:
    progress(f"impact of {anchor.title}")
    result = session.query("anchorGraph", {**anchor.params, "direction": "both"})
    graph = Graph(result)
    anchor_node = graph.nodes.get(graph.anchor or "", {})
    if anchor_node.get("elementKind") in ("function-entry",) or any(e["kind"] in ("parameter", "returns", "used-by") for e in graph.out.get(graph.anchor or "", [])):
        forward = session.query("anchorGraph", {**anchor.params, "direction": "forward"})
        return render_impact_function(Graph(forward), anchor.title, limit), forward
    graphs = [(anchor.title, graph)]
    name = anchor.params.get("name")
    if result["outcome"] == "unsupported" and name and file.suffix != ".py":
        # A field or prop declared in a type has no value of its own: trace each `x.name` read instead.
        sites = member_reads(file, name)
        if not sites:
            return render_trace(result, anchor.title, limit, None), result
        graphs = []
        for line, start, end, text in sites[:limit]:
            span = {"startLine": line, "startColumn": start, "endLine": line, "endColumn": end}
            graphs.append((f"`{text}` {rel}:{line}", Graph(session.query("anchorGraph", {"file": rel, "span": span, "text": text, "direction": "both"}))))
        if len(sites) > limit:
            progress(f"{len(sites) - limit} more reads of .{name} not traced (--limit)")
    return render_impact_value(graphs, anchor.title, limit), [g.result for _, g in graphs]


# -- entry ----------------------------------------------------------------------


def run(args) -> int:
    """``srcly trace`` / ``srcly impact``. Prints the result and returns the exit status."""
    impact = args.command == "impact" or getattr(args, "impact", False)
    effects = getattr(args, "effects", False)
    file, line, col = parse_target(args.target)
    try:
        if not file.is_file():
            raise TraceError(f"{file} is not a file.")
        language = language_of(file)
        root = find_root(file, args.root)
        rel = file.relative_to(root).as_posix()
        progress(f"Starting the data-flow engine for {root} ({language})…")
        session = Session(root, language)
        try:
            command = f"srcly {'impact' if impact else 'trace'}"
            if effects:
                text, data = run_effects(session, file, rel, line, col, args.symbol, args.limit, "srcly trace")
            else:
                anchor = resolve(session, file, rel, line, col, args.symbol, command)
                if impact:
                    text, data = run_impact(session, file, rel, anchor, args.limit)
                else:
                    direction = "backward" if args.direction == "back" else args.direction
                    progress(f"tracing {anchor.title} {direction}")
                    data = session.query("anchorGraph", {**anchor.params, "direction": direction})
                    text = render_trace(data, anchor.title, args.limit, args.depth)
        finally:
            session.close()
    except TraceError as exc:
        print(exc.message, file=sys.stderr)
        return exc.status
    if args.format == "json":
        print(json.dumps(data, indent=1))
    else:
        print(text, end="")
    outcomes = [d.get("outcome") for d in (data if isinstance(data, list) else [data])]
    if all(o in ("unsupported", "not-analyzed", "budget", "stale", "cancelled") for o in outcomes):
        return 1
    return 0
