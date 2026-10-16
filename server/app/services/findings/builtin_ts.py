"""srcly's own TypeScript rules, for TS files no project tsc/eslint checks.

Four tree-sitter rules that need no type information and no config:

- ``explicit-any``: an explicit ``any`` type;
- ``ts-ignore-without-reason``: ``@ts-ignore`` / ``@ts-expect-error`` with no
  explanation after it;
- ``ts-nocheck``: ``@ts-nocheck``, which turns checking off for the file;
- ``non-null-chain``: two or more non-null assertions (``a!.b!``) in one
  member/call chain.

All are warnings: they flag type-safety escapes, not broken code.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Iterable, Optional

from app.services.findings.model import Finding, _under
from app.services.findings.tools import Tool, ToolTimeout, timeout_for

TS_EXTENSIONS = (".ts", ".tsx")
NON_NULL_RUN = 2

_CHAIN = frozenset({"member_expression", "call_expression", "subscript_expression", "non_null_expression"})
_DIRECTIVE = re.compile(r"@ts-(ignore|expect-error|nocheck)\b")
_REASON = re.compile(r"[A-Za-z]{3,}")


def _parser(path: str):
    from tree_sitter import Parser

    from app.services.typescript.typescript_analysis import TSX_LANGUAGE, TYPESCRIPT_LANGUAGE

    return Parser(TSX_LANGUAGE if path.endswith(".tsx") else TYPESCRIPT_LANGUAGE)


def _chain_head(node) -> object:
    """The first child along a chain (the object of ``a.b``, the callee of ``f()``)."""
    return node.children[0] if node.children else None


def _non_null_in_chain(node) -> int:
    count = 0
    while node is not None and node.type in _CHAIN:
        if node.type == "non_null_expression":
            count += 1
        node = _chain_head(node)
    return count


def _is_chain_top(node) -> bool:
    """No enclosing chain link continues this chain (so each chain is counted once)."""
    parent = node.parent
    return not (parent is not None and parent.type in _CHAIN and _chain_head(parent) == node)


def check_source(path: str, source: bytes, tool_id: str) -> list[Finding]:
    tree = _parser(path).parse(source)
    findings: list[Finding] = []

    def add(node, rule: str, message: str) -> None:
        line = node.start_point.row + 1
        findings.append(Finding(path, line, node.end_point.row + 1, node.start_point.column + 1, rule, message, "warning", tool_id))

    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        kind = node.type
        if kind == "predefined_type" and node.text == b"any":
            add(node, "explicit-any", "Explicit `any` type: the checker stops looking here")
        elif kind == "comment":
            text = node.text.decode("utf-8", "ignore")
            match = _DIRECTIVE.search(text)
            if match:
                directive = match.group(0)
                if match.group(1) == "nocheck":
                    add(node, "ts-nocheck", "`@ts-nocheck` turns off type checking for the whole file")
                elif not _REASON.search(text[match.end():]):
                    add(node, "ts-ignore-without-reason", f"`{directive}` without a reason")
        elif kind in _CHAIN and _is_chain_top(node):
            count = _non_null_in_chain(node)
            if count >= NON_NULL_RUN:
                add(node, "non-null-chain", f"{count} non-null assertions (`!`) in one chain")
        stack.extend(reversed(node.children))
    findings.sort(key=lambda f: (f.line, f.column))
    return findings


class BuiltinTsTool(Tool):
    def __init__(self, root: Path, skip_dirs: Iterable[Path] = (), files: Optional[list[str]] = None) -> None:
        super().__init__(
            id="srcly-ts",
            tool="srcly-ts",
            label="srcly TS rules",
            source="srcly defaults",
            root=root,
            extensions=TS_EXTENSIONS,
            timeout=timeout_for("srcly-ts"),
            exclude_dirs=tuple(Path(d) for d in skip_dirs),
        )
        self._files = files

    def _candidates(self) -> list[str]:
        if self._files is not None:
            files = self._files
        else:
            from app.services.analysis import discover_files

            files = discover_files(self.root).files
        out = []
        for f in files:
            if not f.endswith(TS_EXTENSIONS):
                continue
            if any(_under(f, str(d)) for d in self.exclude_dirs):
                continue
            out.append(f)
        return out

    def check(self):
        deadline = time.monotonic() + self.timeout
        findings: list[Finding] = []
        files = self._candidates()
        for path in files:
            if time.monotonic() > deadline:
                raise ToolTimeout(f"after {self.timeout:g}s")
            try:
                source = Path(path).read_bytes()
            except OSError:
                continue
            findings.extend(check_source(path, source, self.id))
        return findings, files
