"""srcly's await-in-loop rule: awaits that run one after another in a loop.

``await-in-loop`` flags a loop whose body awaits a call on every pass, so N
items cost N round trips (the N+1 query). It reports the loop once, with the
calls it awaits. A loop is left alone when:

- the loop's condition or update reads a value that comes from an await in
  its body (pagination, a retry counter, walking a parent chain);
- a ``break`` or ``return`` is guarded by such a value (retry until it works,
  find the first match);
- a ``return`` awaits inside it, or it sleeps (``await new Promise(...)``):
  retry and back-off loops;
- every awaited call is ``tx.*`` inside a ``$transaction(async (tx) => ...)``
  callback, or on a parameter typed as a transaction client
  (``tx: Prisma.TransactionClient``, ``tx: Tx``), where the calls must run in order;
- it only awaits ``Promise.all``/``allSettled``: a chunked batch.

Test files are skipped: browser steps run in order on purpose.

A loop over a database result (``for (const doc of docs)`` where ``docs``
came from an awaited ``prisma.*``/``db.*``/``findMany`` call) is ranked high:
its message starts with ``[db]``. Report only: the fix (``groupBy``,
``createMany``, ``Promise.all``) needs judgment.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Iterator, Optional

from app.services.deps.common import is_test_path
from app.services.findings.model import Finding
from app.services.findings.tools import Tool, ToolTimeout, timeout_for

RULE = "await-in-loop"
_LOOPS = frozenset({"for_statement", "for_in_statement", "while_statement", "do_statement"})
_FUNCTIONS = frozenset({
    "arrow_function", "function_expression", "function", "function_declaration",
    "generator_function_declaration", "method_definition",
})
_TX_TYPE = re.compile(rb"Transaction|\bTx\b")
_DB_CALL = re.compile(rb"\b(prisma|db|tx)\s*\.|\.(findMany|findFirst|findUnique|groupBy|\$queryRaw)\b")


def _parser(path: str):
    from tree_sitter import Parser

    from app.services.typescript.typescript_analysis import TSX_LANGUAGE, TYPESCRIPT_LANGUAGE

    return Parser(TSX_LANGUAGE if path.endswith((".tsx", ".jsx")) else TYPESCRIPT_LANGUAGE)


def _walk(node, stop=_FUNCTIONS) -> Iterator:
    """Descendants of ``node`` that are not inside a nested function."""
    stack = list(node.children)
    while stack:
        n = stack.pop()
        yield n
        if n.type not in stop:
            stack.extend(n.children)


def _names(node) -> set[bytes]:
    if node is None:
        return set()
    out = {node.text} if node.type == "identifier" else set()
    out.update(n.text for n in _walk(node, frozenset()) if n.type in ("identifier", "shorthand_property_identifier_pattern"))
    return out


def _bound_names(node) -> set[bytes]:
    """Names a declarator or assignment left side binds."""
    return {n.text for n in [node, *_walk(node, frozenset())] if n.type in ("identifier", "shorthand_property_identifier_pattern")}


def _header(loop) -> list:
    if loop.type == "for_statement":
        return [loop.child_by_field_name(f) for f in ("condition", "increment")]
    if loop.type in ("while_statement", "do_statement"):
        return [loop.child_by_field_name("condition")]
    return []


def _awaits(body) -> list:
    """Awaits in ``body`` that run on each pass: not in a nested function or nested loop."""
    found = [n for n in _walk(body, _FUNCTIONS | _LOOPS) if n.type == "await_expression"]
    return sorted(found, key=lambda n: n.start_byte)


def _derived(body, awaits) -> set[bytes]:
    """Names in the body that hold an awaited value, or a value computed from one."""
    tainted: set[bytes] = set()
    pairs = []
    for n in _walk(body):
        if n.type == "variable_declarator":
            pairs.append((n.child_by_field_name("name"), n.child_by_field_name("value")))
        elif n.type in ("assignment_expression", "augmented_assignment_expression"):
            pairs.append((n.child_by_field_name("left"), n.child_by_field_name("right")))
    await_ids = {a.id for a in awaits}
    for _ in range(3):
        for left, right in pairs:
            if left is None or right is None:
                continue
            has_await = right.id in await_ids or any(d.id in await_ids for d in _walk(right))
            if has_await or _names(right) & tainted:
                tainted |= _bound_names(left)
    return tainted


def _guarded_exit(body, tainted: set[bytes]) -> bool:
    for n in _walk(body, _FUNCTIONS | _LOOPS):
        if n.type in ("break_statement", "return_statement", "throw_statement"):
            cur = n.parent
            while cur is not None and cur.id != body.id:
                if cur.type == "if_statement" and _names(cur.child_by_field_name("condition")) & tainted:
                    return True
                cur = cur.parent
    return False


def _callee(await_node) -> Optional[object]:
    value = await_node.named_children[0] if await_node.named_children else None
    return value.child_by_field_name("function") if value is not None and value.type == "call_expression" else None


def _in_transaction(await_node) -> bool:
    """``tx.x()`` where ``tx`` is a parameter of a ``$transaction`` callback or typed as a transaction client."""
    callee = _callee(await_node)
    head = callee
    while head is not None and head.type == "member_expression":
        head = head.child_by_field_name("object")
    if head is None or head.type != "identifier":
        return False
    cur = await_node.parent
    while cur is not None:
        if cur.type in ("arrow_function", "function_expression", "function"):
            params = cur.child_by_field_name("parameters") or cur.child_by_field_name("parameter")
            call = cur.parent.parent if cur.parent is not None and cur.parent.type == "arguments" else None
            if params is not None and head.text in _names(params) and call is not None:
                fn = call.child_by_field_name("function")
                return fn is not None and fn.text.endswith(b"$transaction")
        if cur.type in _FUNCTIONS:
            params = cur.child_by_field_name("parameters")
            for p in params.named_children if params is not None else []:
                pattern, typ = p.child_by_field_name("pattern"), p.child_by_field_name("type")
                if pattern is not None and pattern.text == head.text:
                    return typ is not None and _TX_TYPE.search(typ.text) is not None
        cur = cur.parent
    return False


def _iterated(loop) -> Optional[bytes]:
    """The array a ``for ... of`` walks: ``docs`` in ``docs``, ``docs.entries()``, ``Object.entries(docs)``."""
    if loop.type != "for_in_statement":
        return None
    right = loop.child_by_field_name("right")
    while right is not None and right.type == "call_expression":
        fn = right.child_by_field_name("function")
        args = right.child_by_field_name("arguments")
        if fn is not None and fn.type == "member_expression" and fn.child_by_field_name("object").text == b"Object":
            right = args.named_children[0] if args is not None and args.named_children else None
        elif fn is not None and fn.type == "member_expression":
            right = fn.child_by_field_name("object")
        else:
            return None
    return right.text if right is not None and right.type == "identifier" else None


def _from_db(loop, name: bytes) -> Optional[str]:
    """The DB call ``name`` came from, when an enclosing function awaits it into ``name``."""
    scope = loop.parent
    while scope is not None and scope.type not in _FUNCTIONS and scope.type != "program":
        scope = scope.parent
    if scope is None:
        return None
    for n in _walk(scope, frozenset()):
        if n.type == "variable_declarator" and n.child_by_field_name("name") is not None:
            if n.child_by_field_name("name").text != name or n.start_byte > loop.start_byte:
                continue
            value = n.child_by_field_name("value")
            for a in [value, *_walk(value)] if value is not None else []:
                if a.type == "await_expression":
                    callee = _callee(a)
                    if callee is not None and _DB_CALL.search(callee.text):
                        return callee.text.decode("utf-8", "replace")
    return None


def _paced(body, awaits) -> bool:
    """A retry or back-off loop: it returns an awaited value, or sleeps."""
    for a in awaits:
        if a.parent is not None and a.parent.type == "return_statement":
            return True
        value = a.named_children[0] if a.named_children else None
        if value is not None and value.type == "new_expression":
            return True
    return False


def _batch(a) -> bool:
    callee = _callee(a)
    return callee is not None and callee.text in (b"Promise.all", b"Promise.allSettled")


def check_source(path: str, source: bytes, tool_id: str) -> list[Finding]:
    if b"await" not in source:
        return []
    root = _parser(path).parse(source).root_node
    findings: list[Finding] = []
    for loop in (n for n in _walk(root, frozenset()) if n.type in _LOOPS):
        body = loop.child_by_field_name("body")
        if body is None:
            continue
        awaits = _awaits(body)
        if not awaits or all(_in_transaction(a) or _batch(a) for a in awaits) or _paced(body, awaits):
            continue
        tainted = _derived(body, awaits)
        if any(_names(h) & tainted for h in _header(loop)) or _guarded_exit(body, tainted):
            continue
        calls = []
        for a in awaits:
            callee = _callee(a)
            text = (callee.text if callee is not None else a.text).decode("utf-8", "replace").split("(")[0]
            if text not in calls:
                calls.append(text)
        shown = ", ".join(f"`{c}`" for c in calls[:3]) + (f" and {len(calls) - 3} more" if len(calls) > 3 else "")
        iterated = _iterated(loop)
        db = _from_db(loop, iterated) if iterated else None
        rank = f"[db] loops over `{iterated.decode()}` from `{db}`: " if db else ""
        findings.append(
            Finding(
                path,
                loop.start_point.row + 1,
                loop.end_point.row + 1,
                loop.start_point.column + 1,
                RULE,
                f"{rank}awaits {shown} on every pass, one after another; batch the calls or use Promise.all",
                "warning",
                tool_id,
            )
        )
    findings.sort(key=lambda f: (f.line, f.column))
    return findings


class AwaitInLoopTool(Tool):
    def __init__(self, root: Path, files: Optional[list[str]] = None) -> None:
        super().__init__(
            id="srcly-async",
            tool="srcly-async",
            label="srcly await-in-loop",
            source="srcly defaults",
            root=root,
            extensions=(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"),
            timeout=timeout_for("srcly-async"),
        )
        self._files = files

    def check(self):
        deadline = time.monotonic() + self.timeout
        if self._files is not None:
            files = self._files
        else:
            from app.services.analysis import discover_files

            files = [f for f in discover_files(self.root).files if f.endswith(self.extensions)]
        files = [f for f in files if not is_test_path(os.path.relpath(f, self.root))]
        findings: list[Finding] = []
        for path in files:
            if time.monotonic() > deadline:
                raise ToolTimeout(f"after {self.timeout:g}s")
            try:
                source = Path(path).read_bytes()
            except OSError:
                continue
            findings.extend(check_source(path, source, self.id))
        return findings, files
