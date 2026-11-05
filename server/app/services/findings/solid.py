"""srcly's Solid rules, for every TS/TSX file that imports ``solid-js``.

- ``solid-returned-cleanup``: a function returned from the callback of
  ``onMount``, ``createEffect``, ``createRenderEffect`` or ``createComputed``.
  Solid does not run it as a cleanup (an effect passes it to its next run as
  the previous value), so the cleanup never happens. When the return is the
  callback's last statement, the fix rewrites it to ``onCleanup(fn)`` and adds
  ``onCleanup`` to the ``solid-js`` import.

A callback that takes a parameter is left alone: it reads the previous value
on purpose.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

from app.services.findings.model import Finding
from app.services.findings.tools import Tool, ToolTimeout, timeout_for

HOOKS = frozenset({"onMount", "createEffect", "createRenderEffect", "createComputed"})
_FUNCTIONS = frozenset({"arrow_function", "function_expression", "function"})


def _parser(path: str):
    from tree_sitter import Parser

    from app.services.typescript.typescript_analysis import TSX_LANGUAGE, TYPESCRIPT_LANGUAGE

    return Parser(TSX_LANGUAGE if path.endswith((".tsx", ".jsx")) else TYPESCRIPT_LANGUAGE)


def _solid_import(root) -> Optional[object]:
    for stmt in root.children:
        if stmt.type == "import_statement":
            source = stmt.child_by_field_name("source")
            if source is not None and source.text.strip(b"'\"") == b"solid-js":
                return stmt
    return None


def _returns(body):
    """Return statements in ``body`` that belong to it (not to a nested function)."""
    stack = list(body.children)
    while stack:
        node = stack.pop()
        if node.type in _FUNCTIONS:
            continue
        if node.type == "return_statement":
            yield node
            continue
        stack.extend(node.children)


def _import_edit(stmt) -> Optional[dict]:
    """Add ``onCleanup`` to ``import { ... } from "solid-js"`` (nothing when it is there)."""
    clause = next((c for c in stmt.children if c.type == "import_clause"), None)
    named = next((c for c in clause.children if c.type == "named_imports"), None) if clause is not None else None
    if named is None:
        return None
    specs = [c for c in named.children if c.type == "import_specifier"]
    if any(c.child_by_field_name("name").text == b"onCleanup" for c in specs):
        return {}
    if not specs:
        return None
    last = specs[-1]
    return {"start": last.end_byte, "end": last.end_byte, "text": ", onCleanup"}


def check_source(path: str, source: bytes, tool_id: str) -> list[Finding]:
    root = _parser(path).parse(source).root_node
    solid = _solid_import(root)
    if solid is None:
        return []
    findings: list[Finding] = []
    stack = [root]
    while stack:
        node = stack.pop()
        stack.extend(node.children)
        if node.type != "call_expression":
            continue
        fn = node.child_by_field_name("function")
        if fn is None or fn.type != "identifier" or fn.text.decode() not in HOOKS:
            continue
        args = node.child_by_field_name("arguments")
        callback = args.named_children[0] if args is not None and args.named_children else None
        if callback is None or callback.type not in _FUNCTIONS:
            continue
        params = callback.child_by_field_name("parameters") or callback.child_by_field_name("parameter")
        if params is not None and (params.type == "identifier" or params.named_children):
            continue
        body = callback.child_by_field_name("body")
        if body is None or body.type != "statement_block":
            continue
        hook = fn.text.decode()
        for ret in _returns(body):
            value = ret.named_children[0] if ret.named_children else None
            if value is None or value.type not in _FUNCTIONS:
                continue
            fix = None
            statements = [c for c in body.named_children if c.type != "comment"]
            import_edit = _import_edit(solid)
            if statements and statements[-1].id == ret.id and import_edit is not None:
                tail = b";" if ret.text.rstrip().endswith(b";") else b""
                call = b"onCleanup(" + value.text + b")" + tail
                edits = [{"start": ret.start_byte, "end": ret.end_byte, "text": call.decode("utf-8")}]
                if import_edit:
                    edits.append(import_edit)
                fix = {"title": "rewrite the returned cleanup to onCleanup()", "edits": edits}
            findings.append(
                Finding(
                    path,
                    ret.start_point.row + 1,
                    ret.end_point.row + 1,
                    ret.start_point.column + 1,
                    "solid-returned-cleanup",
                    f"`{hook}` ignores a returned cleanup function; call `onCleanup()` instead",
                    "error",
                    tool_id,
                    fix,
                )
            )
    findings.sort(key=lambda f: (f.line, f.column))
    return findings


class SolidTool(Tool):
    def __init__(self, root: Path, files: Optional[list[str]] = None) -> None:
        super().__init__(
            id="srcly-solid",
            tool="srcly-solid",
            label="srcly Solid rules",
            source="srcly defaults",
            root=root,
            extensions=(".ts", ".tsx", ".js", ".jsx"),
            timeout=timeout_for("srcly-solid"),
        )
        self._files = files

    def check(self):
        deadline = time.monotonic() + self.timeout
        if self._files is not None:
            files = self._files
        else:
            from app.services.analysis import discover_files

            files = [f for f in discover_files(self.root).files if f.endswith(self.extensions)]
        findings: list[Finding] = []
        checked: list[str] = []
        for path in files:
            if time.monotonic() > deadline:
                raise ToolTimeout(f"after {self.timeout:g}s")
            try:
                source = Path(path).read_bytes()
            except OSError:
                continue
            # Only Solid files are checked: the rest stay N/A for these rules.
            if b"solid-js" in source:
                checked.append(path)
                findings.extend(check_source(path, source, self.id))
        return findings, checked
