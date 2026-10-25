#!/usr/bin/env python3
"""
Python evidence for srcly's data-flow engine.

Reads a Python source tree with ``ast``, checks it with mypy's build API, and
prints one JSON document on stdout:

- ``elements`` / ``relations``: ProgramElement and ProgramRelation facts in the
  engine's vocabulary (``engine/src/analysis/scope-seam.ts``). Relations point
  the way a value moves: ``from`` is the value, ``to`` is what it reaches.
- ``expressions``: per file, the expressions a selection may name, with their
  checked types (``ty``) and where each type came from (``ts``: ``mypy`` or
  ``annotation``).
- ``scopes``: per file, every function, for the frames the anchor graph draws.
- ``callSites``: per function, its first-party call sites and whether it also
  escapes as a value (R7: a cross-call is followed only with one call site).
- ``routes``: FastAPI and Flask handlers.

The engine loads it behind the same fact index the TypeScript collector fills
(``engine/src/srcly/python/``). Only the standard library is needed to parse;
mypy supplies the checked types and call targets. ``--probe`` reports the
interpreter and whether mypy imports, so the engine can name why it cannot run.

Exit codes: 0 ok, 2 usage, 3 mypy is not importable.
"""

from __future__ import annotations

import argparse
import ast
import builtins
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

SKIP_DIRS = {
    "node_modules", "__pycache__", "site-packages", "dist", "build", "venv", "env",
    ".venv", ".git", ".tox", ".nox", ".mypy_cache", ".pytest_cache", ".ruff_cache",
}
TEST_DIRS = {"tests", "test", "testing"}
HTTP_METHODS = {"get", "post", "put", "delete", "patch", "options", "head"}
EXPRESSION_KINDS = (ast.Name, ast.Attribute, ast.Call, ast.Subscript, ast.BoolOp, ast.IfExp, ast.Await, ast.arg)

# Recognised boundaries, by the checked fullname of the callee (or the import-resolved
# dotted name when the checker has none). Matched exactly, then by prefix ending in ".".
# The value is (element kind, label, attributes). The engine derives origin and terminal
# roles and the boundary from the kind (engine/src/analysis/evidence-slice-normalization.ts):
# environment-input, process-input (`name` stdin or argv), file-input, fetch-input and
# external-read are origins; stdout, exit-status, file-write, http-response and
# external-effect are terminals.
Recognition = tuple[str, str, dict[str, Any]]
ORIGIN_CALLS: dict[str, Recognition] = {
    "os.getenv": ("environment-input", "environment", {}),
    "os.environ.get": ("environment-input", "environment", {}),
    "os._Environ.get": ("environment-input", "environment", {}),
    "builtins.input": ("process-input", "stdin", {"name": "stdin"}),
    "builtins.open": ("file-input", "file", {}),
    "io.open": ("file-input", "file", {}),
    "pathlib.Path.read_text": ("file-input", "file read", {}),
    "pathlib.Path.read_bytes": ("file-input", "file read", {}),
    "pathlib.Path.open": ("file-input", "file", {}),
    "json.load": ("file-input", "JSON file read", {}),
    "tomllib.load": ("file-input", "TOML file read", {}),
    "yaml.safe_load": ("file-input", "YAML read", {}),
    "subprocess.run": ("external-read", "subprocess", {}),
    "subprocess.check_output": ("external-read", "subprocess", {}),
    "subprocess.Popen": ("external-read", "subprocess", {}),
    "urllib.request.urlopen": ("fetch-input", "network request", {}),
    "requests.get": ("fetch-input", "network request", {}),
    "requests.post": ("fetch-input", "network request", {}),
    "requests.request": ("fetch-input", "network request", {}),
    "requests.sessions.Session.": ("fetch-input", "network request", {}),
    "httpx.get": ("fetch-input", "network request", {}),
    "httpx.post": ("fetch-input", "network request", {}),
    "httpx.request": ("fetch-input", "network request", {}),
    "httpx._client.Client.": ("fetch-input", "network request", {}),
    "httpx._client.AsyncClient.": ("fetch-input", "network request", {}),
    "sqlite3.Cursor.execute": ("external-read", "database query", {}),
    "sqlite3.Cursor.fetchall": ("external-read", "database rows", {}),
    "sqlite3.Cursor.fetchone": ("external-read", "database row", {}),
    "sqlite3.Connection.execute": ("external-read", "database query", {}),
    "sqlalchemy.orm.session.Session.execute": ("external-read", "database query", {}),
    "sqlalchemy.orm.session.Session.scalars": ("external-read", "database query", {}),
    "sqlalchemy.orm.session.Session.get": ("external-read", "database row", {}),
    "sqlalchemy.orm.session.Session.query": ("external-read", "database query", {}),
}
TERMINAL_CALLS: dict[str, Recognition] = {
    "builtins.print": ("stdout", "print", {}),
    "sys.stdout.write": ("stdout", "stdout", {}),
    "sys.exit": ("exit-status", "exit", {}),
    "logging.Logger.": ("external-effect", "log", {}),
    "logging.LoggerAdapter.": ("external-effect", "log", {}),
    **{f"logging.{level}": ("external-effect", "log", {}) for level in ("debug", "info", "warning", "error", "exception", "critical", "log")},
    "pathlib.Path.write_text": ("file-write", "file write", {}),
    "pathlib.Path.write_bytes": ("file-write", "file write", {}),
    "json.dump": ("file-write", "JSON file write", {}),
    "typing.IO.write": ("file-write", "file write", {}),
    "typing.TextIO.write": ("file-write", "file write", {}),
    "io.TextIOWrapper.write": ("file-write", "file write", {}),
    "_io.TextIOWrapper.write": ("file-write", "file write", {}),
    "fastapi.HTTPException": ("http-response", "HTTP error", {}),
    "fastapi.exceptions.HTTPException": ("http-response", "HTTP error", {}),
    "starlette.exceptions.HTTPException": ("http-response", "HTTP error", {}),
    "fastapi.responses.": ("http-response", "HTTP response", {}),
    "starlette.responses.": ("http-response", "HTTP response", {}),
    "flask.json.jsonify": ("http-response", "HTTP response", {}),
    "flask.abort": ("http-response", "HTTP error", {}),
}
# Reads (not calls) that are origins: `os.environ["X"]`, `sys.argv`, Flask's request global.
ORIGIN_READS: dict[str, Recognition] = {
    "os.environ": ("environment-input", "environment", {}),
    "sys.argv": ("process-input", "command-line arguments", {"name": "argv"}),
    "sys.stdin": ("process-input", "stdin", {"name": "stdin"}),
    "flask.request": ("parameter", "the request", {"originRole": "request", "name": "request"}),
    "flask.globals.request": ("parameter", "the request", {"originRole": "request", "name": "request"}),
}
FASTAPI_PARAM_FUNCS = {"Query": "query", "Path": "path", "Body": "body", "Header": "header", "Cookie": "cookie", "Form": "form", "File": "file", "Depends": "dependency", "Security": "dependency"}
FASTAPI_REQUEST_TYPES = {"Request", "WebSocket", "HTTPConnection"}
FASTAPI_RUNTIME_TYPES = {"Response", "BackgroundTasks"}
MODEL_BASES = {"BaseModel", "pydantic.BaseModel", "pydantic.main.BaseModel", "SQLModel", "TypedDict", "NamedTuple"}


def lookup(table: dict[str, Any], name: str | None) -> Any:
    if not name:
        return None
    if name in table:
        return table[name]
    for key, value in table.items():
        if key.endswith(".") and name.startswith(key):
            return value
    return None


# --------------------------------------------------------------------------- sources


class Source:
    """One file: its text, and conversions from ``ast`` byte columns to the engine's spans."""

    def __init__(self, path: Path, rel: str, module: str, text: str):
        self.path = path
        self.rel = rel
        self.module = module
        self.text = text
        self.lines = text.splitlines(keepends=True) or [""]
        self.line_starts16: list[int] = []
        total = 0
        for line in self.lines:
            self.line_starts16.append(total)
            total += utf16_len(line)
        self.tree: ast.Module | None = None
        self.encoded: list[bytes] | None = None

    def col16(self, line: int, byte_col: int) -> int:
        """0-based UTF-16 column for a 0-based UTF-8 byte column on a 1-based line."""
        if line - 1 >= len(self.lines):
            return 0
        text = self.lines[line - 1]
        if text.isascii():
            return byte_col
        return utf16_len(text.encode("utf-8")[:byte_col].decode("utf-8", errors="ignore"))

    def span(self, node: ast.AST) -> dict[str, int]:
        sl, sc = node.lineno, self.col16(node.lineno, node.col_offset)  # type: ignore[attr-defined]
        el = getattr(node, "end_lineno", None) or sl
        ec = self.col16(el, getattr(node, "end_col_offset", None) or node.col_offset)  # type: ignore[attr-defined]
        return {"startLine": sl, "startColumn": sc + 1, "endLine": el, "endColumn": ec + 1}

    def name_span(self, node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef) -> dict[str, int]:
        """The span of a def's or class's name token."""
        line = self.lines[node.lineno - 1] if node.lineno - 1 < len(self.lines) else ""
        match = re.search(rf"\b(?:def|class)\s+({re.escape(node.name)})\b", line)
        start = utf16_len(line[: match.start(1)]) if match else self.col16(node.lineno, node.col_offset)
        return {"startLine": node.lineno, "startColumn": start + 1, "endLine": node.lineno, "endColumn": start + utf16_len(node.name) + 1}

    def offset(self, line: int, column: int) -> int:
        if line - 1 >= len(self.line_starts16):
            return self.line_starts16[-1] if self.line_starts16 else 0
        return self.line_starts16[line - 1] + column - 1

    def segment(self, node: ast.AST) -> str:
        """The node's source text (``ast.get_source_segment`` re-splits the whole file on every call)."""
        start, end = getattr(node, "lineno", None), getattr(node, "end_lineno", None)
        if start is None or end is None or start - 1 >= len(self.lines):
            return ""
        if self.encoded is None:
            self.encoded = [line.encode("utf-8") for line in self.lines]
        col, end_col = node.col_offset, node.end_col_offset  # type: ignore[attr-defined]
        if start == end:
            return self.encoded[start - 1][col:end_col].decode("utf-8", errors="replace")
        parts = [self.encoded[start - 1][col:], *self.encoded[start:end - 1], self.encoded[end - 1][:end_col]]
        return b"".join(parts).decode("utf-8", errors="replace")

    def location(self, span: dict[str, int]) -> dict[str, Any]:
        return {"file": self.rel, "line": span["startLine"], "column": span["startColumn"], "span": span}


def utf16_len(text: str) -> int:
    if text.isascii():
        return len(text)
    return len(text.encode("utf-16-le")) // 2


def span_key(span: dict[str, int]) -> str:
    return f"{span['startLine']}:{span['startColumn']}-{span['endLine']}:{span['endColumn']}"


def clip(text: str, limit: int = 120) -> str:
    one = " ".join(text.split())
    return one if len(one) <= limit else one[: limit - 1] + "…"


def discover(root: Path, source: Path, include_tests: bool = False) -> list[tuple[Path, str]]:
    """
    ``.py`` files under ``source`` with their module names. A module's name is
    its path from the import root (``src/`` when the project has one, else the
    root), so namespace packages without ``__init__.py`` name the way imports do.
    Tests are left out unless asked for: they drive the app, they are not its data flow.
    """
    import_root = root / "src" if (root / "src").is_dir() and source.is_relative_to(root / "src") else root
    found: list[tuple[Path, str]] = []
    for folder, dirs, files in os.walk(source):
        dirs[:] = sorted(
            d for d in dirs
            if d not in SKIP_DIRS and not d.startswith(".") and not d.endswith(".egg-info") and (include_tests or d not in TEST_DIRS)
        )
        for name in sorted(files):
            if not name.endswith(".py"):
                continue
            if not include_tests and (name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"):
                continue
            path = Path(folder) / name
            relative = path.relative_to(import_root) if path.is_relative_to(import_root) else path.relative_to(root)
            parts = list(relative.with_suffix("").parts)
            if parts and parts[-1] == "__init__":
                parts.pop()
            found.append((path, ".".join(parts) or path.parent.name))
    return found


# --------------------------------------------------------------------------- checker


@dataclass
class CheckedTypes:
    """What mypy proved: types by span, call targets by call span, model classes by fullname."""

    status: str = "missing"  # "ok" | "failed" | "missing"
    message: str | None = None
    version: str | None = None
    elapsed_ms: int = 0
    types: dict[str, dict[str, str]] = field(default_factory=dict)  # rel -> span key -> type text
    callees: dict[str, dict[str, str]] = field(default_factory=dict)  # rel -> call span key -> definition fullname
    receivers: dict[str, dict[str, str]] = field(default_factory=dict)  # rel -> expr span key -> type fullname
    models: set[str] = field(default_factory=set)  # fullnames of pydantic/dataclass/TypedDict classes


def mypy_available() -> str | None:
    try:
        import mypy.version  # noqa: PLC0415

        return mypy.version.__version__
    except Exception:  # noqa: BLE001
        return None


def run_mypy(sources: list[Source], types_python: str | None, files_root: Path) -> CheckedTypes:
    checked = CheckedTypes()
    version = mypy_available()
    if version is None:
        checked.message = "mypy is not importable in this interpreter"
        return checked
    checked.version = version
    started = time.perf_counter()
    try:
        from mypy import build  # noqa: PLC0415
        from mypy.messages import format_type_bare  # noqa: PLC0415
        from mypy.modulefinder import BuildSource  # noqa: PLC0415
        from mypy.nodes import CallExpr, IndexExpr, MemberExpr, NameExpr, OpExpr, RefExpr, TypeInfo  # noqa: PLC0415
        from mypy.options import Options  # noqa: PLC0415
        from mypy.server.subexpr import get_subexpressions  # noqa: PLC0415
        from mypy.types import AnyType, CallableType, Instance, Overloaded, TypeType, get_proper_type  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        checked.status = "failed"
        checked.message = f"mypy did not load: {exc}"
        return checked

    options = Options()
    options.export_types = True
    options.incremental = False
    options.preserve_asts = True
    options.check_untyped_defs = True
    options.follow_imports = "silent"
    options.ignore_missing_imports = True
    options.python_version = sys.version_info[:2]
    if types_python:
        options.python_executable = types_python
    seen: set[str] = set()
    build_sources = []
    by_module: dict[str, Source] = {}
    for source in sources:
        if source.module in seen or source.tree is None:
            continue
        seen.add(source.module)
        by_module[source.module] = source
        build_sources.append(BuildSource(str(source.path), source.module))
    try:
        result = build.build(build_sources, options)
    except Exception as exc:  # noqa: BLE001  (CompileError on a blocking error)
        checked.status = "failed"
        checked.message = f"mypy stopped: {str(exc).splitlines()[0] if str(exc) else type(exc).__name__}"
        checked.elapsed_ms = int((time.perf_counter() - started) * 1000)
        return checked

    def key_of(source: Source, expr: Any) -> str | None:
        if expr.line < 1 or expr.end_line is None or expr.end_column is None:
            return None
        sl, el = expr.line, expr.end_line
        return f"{sl}:{source.col16(sl, expr.column) + 1}-{el}:{source.col16(el, expr.end_column) + 1}"

    def definition_of(typ: Any) -> str | None:
        proper = get_proper_type(typ)
        if isinstance(proper, Overloaded) and proper.items:
            proper = proper.items[0]
        if isinstance(proper, CallableType):
            if proper.definition is not None:
                name = getattr(proper.definition, "fullname", None)
                # A class's constructor: name the class, not `__init__`.
                if name and name.endswith(".__init__"):
                    return name[: -len(".__init__")]
                return name
            ret = get_proper_type(proper.ret_type)
            if proper.is_type_obj() and isinstance(ret, Instance):
                return ret.type.fullname
        if isinstance(proper, TypeType) and isinstance(proper.item, Instance):
            return proper.item.type.fullname
        return None

    def record(source: Source, expr: Any) -> None:
        typ = result.types.get(expr)
        if typ is None or not isinstance(expr, (NameExpr, MemberExpr, CallExpr, IndexExpr, OpExpr)):
            return
        key = key_of(source, expr)
        if key is None:
            return
        if isinstance(expr, CallExpr):
            callee_type = result.types.get(expr.callee)
            target = definition_of(callee_type) if callee_type is not None else None
            if target is None and isinstance(expr.callee, RefExpr) and expr.callee.fullname:
                target = expr.callee.fullname
            if target:
                checked.callees.setdefault(source.rel, {})[key] = target
        proper = get_proper_type(typ)
        if isinstance(proper, AnyType):
            return
        try:
            text = format_type_bare(typ, options)
        except Exception:  # noqa: BLE001
            text = str(typ)
        checked.types.setdefault(source.rel, {})[key] = text
        if isinstance(proper, Instance):
            checked.receivers.setdefault(source.rel, {})[key] = proper.type.fullname

    for module, source in by_module.items():
        tree = result.files.get(module)
        if tree is not None:
            for expr in get_subexpressions(tree):
                record(source, expr)

    for module in by_module:
        tree = result.files.get(module)
        if tree is None:
            continue
        for name, symbol in tree.names.items():
            node = symbol.node
            if isinstance(node, TypeInfo) and node.fullname.startswith(module + "."):
                collect_models(node, checked.models)
    checked.status = "ok"
    checked.message = f"{len(result.errors)} mypy diagnostics" if result.errors else None
    checked.elapsed_ms = int((time.perf_counter() - started) * 1000)
    return checked


def collect_models(info: Any, out: set[str]) -> None:
    mro = [base.fullname for base in info.mro]
    if (
        "pydantic.main.BaseModel" in mro
        or info.is_named_tuple
        or info.typeddict_type is not None
        or "dataclass" in (info.metadata or {})
        or any(name.startswith("sqlmodel.") for name in mro)
    ):
        out.add(info.fullname)
    for symbol in info.names.values():
        inner = symbol.node
        if inner is not None and type(inner).__name__ == "TypeInfo" and inner is not info:
            collect_models(inner, out)


# --------------------------------------------------------------------------- program index


@dataclass
class FunctionInfo:
    source: Source
    node: ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda
    qualname: str
    fullname: str
    entry_id: str
    class_name: str | None = None
    is_method: bool = False
    params: list[ast.arg] = field(default_factory=list)
    returns: list[ast.Return] = field(default_factory=list)
    route: dict[str, Any] | None = None


@dataclass
class ClassInfo:
    source: Source
    node: ast.ClassDef
    fullname: str
    bases: list[str]
    fields: dict[str, ast.AnnAssign] = field(default_factory=dict)
    methods: dict[str, FunctionInfo] = field(default_factory=dict)
    is_model: bool = False


class Program:
    def __init__(self, root: Path, sources: list[Source], checked: CheckedTypes):
        self.root = root
        self.sources = sources
        self.checked = checked
        self.modules = {source.module: source for source in sources}
        self.functions: dict[str, FunctionInfo] = {}  # fullname -> info
        self.functions_by_node: dict[int, FunctionInfo] = {}
        self.classes: dict[str, ClassInfo] = {}
        self.imports: dict[str, dict[str, str]] = {}  # module -> local name -> dotted target
        self.module_names: dict[str, dict[str, str]] = {}  # module -> top-level name -> kind
        self.routers: dict[str, dict[str, Any]] = {}  # "module.var" -> {prefix, framework}
        self.elements: dict[str, dict[str, Any]] = {}
        self.relations: dict[str, dict[str, Any]] = {}
        self.gaps: list[dict[str, Any]] = []
        self.expressions: dict[str, dict[str, dict[str, Any]]] = {}
        self.scopes: dict[str, list[dict[str, Any]]] = {}
        self.calls: dict[str, dict[str, Any]] = {}  # entry id -> {calls, escapes}
        self.routes: list[dict[str, Any]] = []

    # ---- index

    def index(self) -> None:
        for source in self.sources:
            if source.tree is None:
                continue
            imports: dict[str, str] = {}
            names: dict[str, str] = {}
            self.imports[source.module] = imports
            self.module_names[source.module] = names
            package = source.module.rsplit(".", 1)[0] if "." in source.module else ""
            if source.path.name == "__init__.py":
                package = source.module
            for stmt in ast.walk(source.tree):
                if isinstance(stmt, ast.Import):
                    for alias in stmt.names:
                        imports[alias.asname or alias.name.split(".")[0]] = alias.name if alias.asname else alias.name.split(".")[0]
                elif isinstance(stmt, ast.ImportFrom):
                    base = resolve_relative(package, stmt.module, stmt.level)
                    for alias in stmt.names:
                        if alias.name != "*":
                            imports[alias.asname or alias.name] = f"{base}.{alias.name}" if base else alias.name
            for stmt in source.tree.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    names[stmt.name] = "function"
                elif isinstance(stmt, ast.ClassDef):
                    names[stmt.name] = "class"
                elif isinstance(stmt, (ast.Assign, ast.AnnAssign)):
                    for target in stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]:
                        if isinstance(target, ast.Name):
                            names[target.id] = "variable"
                            self.note_router(source, target.id, stmt.value)
            self.index_defs(source, source.tree.body, prefix="", class_info=None)
        for info in self.classes.values():
            info.is_model = self.is_model(info)

    def note_router(self, source: Source, name: str, value: ast.expr | None) -> None:
        if not isinstance(value, ast.Call):
            return
        callee = self.dotted(source, value.func) or ""
        last = callee.rsplit(".", 1)[-1]
        if last in ("APIRouter", "FastAPI", "Flask", "Blueprint"):
            prefix = ""
            for keyword in value.keywords:
                if keyword.arg in ("prefix", "url_prefix") and isinstance(keyword.value, ast.Constant) and isinstance(keyword.value.value, str):
                    prefix = keyword.value.value
            framework = "flask" if last in ("Flask", "Blueprint") else "fastapi"
            self.routers[f"{source.module}.{name}"] = {"prefix": prefix, "framework": framework, "mounted": ""}

    def index_defs(self, source: Source, body: list[ast.stmt], prefix: str, class_info: ClassInfo | None) -> None:
        for stmt in body:
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                qualname = f"{prefix}{stmt.name}"
                info = FunctionInfo(
                    source=source,
                    node=stmt,
                    qualname=qualname,
                    fullname=f"{source.module}.{qualname}",
                    entry_id=element_id("function-entry", source.rel, source.span(stmt)),
                    class_name=class_info.fullname if class_info else None,
                    is_method=class_info is not None and not any(dotted_name(d) == "staticmethod" for d in stmt.decorator_list),
                    params=all_params(stmt.args),
                    returns=own_returns(stmt),
                )
                self.functions[info.fullname] = info
                self.functions_by_node[id(stmt)] = info
                if class_info is not None:
                    class_info.methods[stmt.name] = info
                self.index_defs(source, stmt.body, prefix=f"{qualname}.<locals>.", class_info=None)
            elif isinstance(stmt, ast.ClassDef):
                fullname = f"{source.module}.{prefix}{stmt.name}"
                info = ClassInfo(source=source, node=stmt, fullname=fullname, bases=[self.dotted(source, b) or dotted_name(b) for b in stmt.bases])
                for item in stmt.body:
                    if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                        info.fields[item.target.id] = item
                info.is_model = any(dotted_name(d).split(".")[-1] in ("dataclass", "define", "frozen") for d in stmt.decorator_list)
                self.classes[fullname] = info
                self.index_defs(source, stmt.body, prefix=f"{prefix}{stmt.name}.", class_info=info)
            elif isinstance(stmt, (ast.If, ast.Try, ast.With)):
                for block in block_bodies(stmt):
                    self.index_defs(source, block, prefix, class_info)

    def is_model(self, info: ClassInfo, depth: int = 0) -> bool:
        if info.fullname in self.checked.models or info.is_model:
            return True
        if depth > 8:
            return False
        for base in info.bases:
            if base in MODEL_BASES or base.split(".")[-1] in ("BaseModel", "SQLModel", "TypedDict", "NamedTuple"):
                return True
            parent = self.classes.get(base)
            if parent is not None and self.is_model(parent, depth + 1):
                return True
        return False

    def dotted(self, source: Source, node: ast.AST) -> str | None:
        """The import-resolved dotted name of a name or attribute chain: `os.environ.get`."""
        parts: list[str] = []
        while isinstance(node, ast.Attribute):
            parts.insert(0, node.attr)
            node = node.value
        if not isinstance(node, ast.Name):
            return None
        imports = self.imports.get(source.module, {})
        names = self.module_names.get(source.module, {})
        if node.id in imports:
            head = imports[node.id]
        elif node.id in names:
            head = f"{source.module}.{node.id}"
        elif hasattr(builtins, node.id):
            head = f"builtins.{node.id}"
        else:
            return None
        return ".".join([head, *parts])

    def resolve_function(self, name: str | None) -> FunctionInfo | None:
        if not name:
            return None
        if name in self.functions:
            return self.functions[name]
        # A re-export: `from app.x import f` in a package __init__.
        module, _, attr = name.rpartition(".")
        target = self.imports.get(module, {}).get(attr)
        return self.functions.get(target) if target and target != name else None

    def resolve_class(self, name: str | None) -> ClassInfo | None:
        if not name:
            return None
        if name in self.classes:
            return self.classes[name]
        module, _, attr = name.rpartition(".")
        target = self.imports.get(module, {}).get(attr)
        return self.classes.get(target) if target and target != name else None

    # ---- facts

    def add_element(self, element: dict[str, Any]) -> str:
        self.elements.setdefault(element["id"], element)
        return element["id"]

    def relate(self, source: Source, origin: str | None, target: str | None, kind: str, detail: str, at: dict[str, int], status: str = "proven", proof_kind: str = "syntax") -> None:
        if not origin or not target or origin == target:
            return
        relation_id = f"{kind}:{origin}->{target}"
        if relation_id in self.relations:
            return
        self.relations[relation_id] = {
            "id": relation_id,
            "from": origin,
            "to": target,
            "kind": kind,
            "status": status,
            "proof": {"kind": proof_kind, "detail": detail, "locations": [source.location(at)], "status": status},
        }

    def record_call(self, callee: FunctionInfo, source: Source, line: int) -> None:
        sites = self.calls.setdefault(callee.entry_id, {"calls": [], "escapes": False, "name": callee.qualname})
        sites["calls"].append(f"{source.rel}:{line}")

    def record_escape(self, callee: FunctionInfo) -> None:
        sites = self.calls.setdefault(callee.entry_id, {"calls": [], "escapes": False, "name": callee.qualname})
        sites["escapes"] = True

    def checked_type(self, source: Source, span: dict[str, int]) -> str | None:
        return self.checked.types.get(source.rel, {}).get(span_key(span))

    def note_expression(self, source: Source, node: ast.AST, kind: str, text: str, type_text: str | None, type_source: str | None, **extra: Any) -> None:
        span = source.span(node) if "span" not in extra else extra.pop("span")
        table = self.expressions.setdefault(source.rel, {})
        key = span_key(span)
        if key in table and table[key].get("ty") and not type_text:
            return
        entry = {"s": [span["startLine"], span["startColumn"], span["endLine"], span["endColumn"]], "k": kind, "t": clip(text, 240), "ty": type_text, "ts": type_source}
        entry.update({k: v for k, v in extra.items() if v is not None})
        table[key] = entry

    def run(self) -> None:
        self.index()
        self.mount_routers()
        for source in self.sources:
            if source.tree is None:
                continue
            ModuleWalker(self, source).run()
        self.finish_returns()

    def mount_routers(self) -> None:
        """`app.include_router(items.router, prefix="/v1")` adds the mount prefix to that router's routes."""
        for source in self.sources:
            if source.tree is None:
                continue
            for node in ast.walk(source.tree):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("include_router", "register_blueprint") and node.args):
                    continue
                target = self.dotted(source, node.args[0])
                router = self.routers.get(target or "")
                if router is None:
                    continue
                for keyword in node.keywords:
                    if keyword.arg in ("prefix", "url_prefix") and isinstance(keyword.value, ast.Constant) and isinstance(keyword.value.value, str):
                        router["mounted"] = keyword.value.value

    def finish_returns(self) -> None:
        """
        A function nobody in the program calls is an entry: its returns leave the
        program (`return`, or an HTTP response for a route handler). A helper's
        returns stay `return-expression`, carried to its call sites by `return-value`.
        """
        for info in self.functions.values():
            sites = self.calls.get(info.entry_id)
            entry = sites is None or not sites["calls"]
            for ret in info.returns:
                if ret.value is None:
                    continue
                element = self.elements.get(element_id("return", info.source.rel, info.source.span(ret)))
                if element is None:
                    continue
                if info.route is not None:
                    element["kind"] = "return"
                    element["attributes"]["terminalRole"] = "http-response"
                    element["label"] = clip(f"{info.source.segment(ret)} → {info.route['pathPattern']}")
                elif entry:
                    element["kind"] = "return"
                    element["attributes"]["terminalRole"] = "return"

    def to_json(self) -> dict[str, Any]:
        """
        The wire format is compact; ``engine/src/srcly/python/facts.ts`` expands
        it. Files are indexes into ``files``; an element's id is rebuilt from its
        id kind, file, span and suffix; relations name their endpoints by element index.
        """
        files = [source.rel for source in self.sources]
        file_index = {rel: i for i, rel in enumerate(files)}

        def span4(span: dict[str, int]) -> list[int]:
            return [span["startLine"], span["startColumn"], span["endLine"], span["endColumn"]]

        def proof(item: dict[str, Any]) -> dict[str, Any]:
            out: dict[str, Any] = {"k": item["kind"], "d": item["detail"]}
            if item["locations"]:
                location = item["locations"][0]
                out["f"] = file_index.get(location["file"], -1)
                out["s"] = span4(location["span"])
            return out

        index = {element_id: i for i, element_id in enumerate(self.elements)}
        elements = []
        for element in self.elements.values():
            location = element["location"]
            span = location["span"]
            id_kind = element["id"].split(":", 2)[1]
            prefix = f"py:{id_kind}:{location['file']}:{span_key(span)}"
            out: dict[str, Any] = {"k": element["kind"], "f": file_index[location["file"]], "s": span4(span), "l": element["label"], "p": proof(element["proof"])}
            if id_kind != element["kind"]:
                out["ik"] = id_kind
            if element["id"] != prefix:
                out["x"] = element["id"][len(prefix):]
            if element["operationKind"]:
                out["op"] = element["operationKind"]
            if element["ownerId"] in index:
                out["w"] = index[element["ownerId"]]
            if element["attributes"]:
                out["a"] = element["attributes"]
            elements.append(out)
        relations = []
        for relation in self.relations.values():
            source, target = index.get(relation["from"]), index.get(relation["to"])
            if source is None or target is None:
                continue
            out = {"k": relation["kind"], "a": source, "b": target, "p": proof(relation["proof"])}
            if relation["status"] != "proven":
                out["st"] = relation["status"]
            relations.append(out)
        return {
            "files": files,
            "elements": elements,
            "relations": relations,
            "expressions": {rel: list(table.values()) for rel, table in self.expressions.items()},
            "scopes": self.scopes,
            "callSites": self.calls,
            "routes": sorted(self.routes, key=lambda route: route["key"]),
        }


def resolve_relative(package: str, module: str | None, level: int) -> str:
    if level == 0:
        return module or ""
    parts = package.split(".") if package else []
    if level > 1:
        parts = parts[: len(parts) - (level - 1)]
    if module:
        parts.append(module)
    return ".".join(parts)


def dotted_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        return dotted_name(node.func)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{dotted_name(node.value)}.{node.attr}"
    return ""


def all_params(args: ast.arguments) -> list[ast.arg]:
    return [*args.posonlyargs, *args.args, *([args.vararg] if args.vararg else []), *args.kwonlyargs, *([args.kwarg] if args.kwarg else [])]


def own_returns(fn: ast.AST) -> list[ast.Return]:
    """Return statements of `fn` itself, not of functions nested in it."""
    out: list[ast.Return] = []
    stack = list(ast.iter_child_nodes(fn))
    while stack:
        node = stack.pop()
        if isinstance(node, ast.Return):
            out.append(node)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            continue
        stack.extend(ast.iter_child_nodes(node))
    return sorted(out, key=lambda r: (r.lineno, r.col_offset))


def block_bodies(stmt: ast.stmt) -> Iterable[list[ast.stmt]]:
    for name in ("body", "orelse", "finalbody"):
        block = getattr(stmt, name, None)
        if block:
            yield block
    for handler in getattr(stmt, "handlers", []) or []:
        yield handler.body


def element_id(kind: str, rel: str, span: dict[str, int], suffix: str = "") -> str:
    return f"py:{kind}:{rel}:{span_key(span)}{suffix}"


# --------------------------------------------------------------------------- walkers


class Scope:
    """Name bindings in one function (or module, or comprehension), flow-insensitive with source order."""

    def __init__(self, parent: Scope | None, kind: str):
        self.parent = parent
        self.kind = kind
        self.defs: dict[str, list[tuple[tuple[int, int], str]]] = {}
        self.loads: list[tuple[str, tuple[int, int], str, dict[str, int]]] = []

    def bind(self, name: str, position: tuple[int, int], element: str) -> None:
        self.defs.setdefault(name, []).append((position, element))

    def owner_of(self, name: str) -> Scope | None:
        scope: Scope | None = self
        while scope is not None:
            if name in scope.defs:
                return scope
            # Class bodies do not enclose their methods.
            scope = scope.parent
        return None


class ModuleWalker:
    def __init__(self, program: Program, source: Source):
        self.program = program
        self.source = source

    def run(self) -> None:
        source = self.source
        assert source.tree is not None
        module_scope = Scope(None, "module")
        walker = BodyWalker(self.program, source, module_scope, function=None)
        walker.walk_body(source.tree.body)
        walker.close()


class BodyWalker:
    """Facts for one body. Nested functions are walked after this body, with this scope as their parent."""

    def __init__(self, program: Program, source: Source, scope: Scope, function: FunctionInfo | None, class_info: ClassInfo | None = None):
        self.program = program
        self.source = source
        self.scope = scope
        self.function = function
        self.class_info = class_info
        self.pending: list[tuple[ast.AST, Scope, ClassInfo | None]] = []
        self.inner_scopes: list[Scope] = []
        self.straight: dict[str, bool] = {}
        self.owner = function.entry_id if function else None

    # ---- helpers

    def span(self, node: ast.AST) -> dict[str, int]:
        return self.source.span(node)

    def type_of(self, node: ast.AST, span: dict[str, int] | None = None) -> tuple[str | None, str | None]:
        found = self.program.checked_type(self.source, span or self.span(node))
        return (found, "mypy") if found else (None, None)

    def element(self, kind: str, node: ast.AST | None, label: str, *, span: dict[str, int] | None = None, suffix: str = "", id_kind: str | None = None,
                operation: str | None = None, proof: dict[str, Any] | None = None, type_text: str | None = None, type_source: str | None = None,
                attributes: dict[str, Any] | None = None) -> str:
        """
        One ProgramElement in the collector's raw shape (``engine/src/analysis/program-evidence.ts``):
        one proof, a kind the engine maps to roles and boundaries, and attributes for the rest.
        """
        at = span or self.span(node)  # type: ignore[arg-type]
        if type_text is None and node is not None:
            type_text, type_source = self.type_of(node, at)
        attrs: dict[str, Any] = {}
        if type_text:
            attrs["typeText"] = type_text
            attrs["typeSource"] = type_source
        if attributes:
            attrs.update(attributes)
        if proof is None:
            what = type(node).__name__ if node is not None else "statement"
            proof = {"kind": "ast-node", "detail": f"Python's ast has a {what} here", "locations": [self.source.location(at)]}
        element = {
            "id": element_id(id_kind or kind, self.source.rel, at, suffix),
            "kind": kind,
            "operationKind": operation,
            "label": clip(label),
            "location": self.source.location(at),
            "ownerId": self.owner,
            "attributes": attrs,
            "proof": proof,
        }
        return self.program.add_element(element)

    def relate(self, origin: str | None, target: str | None, kind: str, detail: str, node: ast.AST | dict[str, int], status: str = "proven", proof_kind: str = "syntax") -> None:
        at = node if isinstance(node, dict) else self.span(node)
        self.program.relate(self.source, origin, target, kind, detail, at, status, proof_kind)

    def note(self, node: ast.AST, kind: str, **extra: Any) -> None:
        type_text, type_source = self.type_of(node)
        if "ty" in extra:
            type_text, type_source = extra.pop("ty"), extra.pop("tsrc", "annotation")
        self.program.note_expression(self.source, node, kind, self.source.segment(node), type_text, type_source, **extra)

    # ---- bodies

    def walk_body(self, body: list[ast.stmt]) -> None:
        for stmt in body:
            self.stmt(stmt)

    def close(self) -> None:
        """Join every load to the bindings it can see, then walk nested functions."""
        self.link_loads(self.scope)
        for scope in self.inner_scopes:
            self.link_loads(scope)
        while self.pending:
            node, parent, class_info = self.pending.pop(0)
            if isinstance(node, ast.ClassDef):
                scope = Scope(parent, "class")
                fullname = class_fullname(self.program, self.source, node)
                walker = BodyWalker(self.program, self.source, scope, self.function, class_info=self.program.classes.get(fullname))
                walker.walk_body(node.body)
                walker.close()
                continue
            info = self.program.functions_by_node.get(id(node))
            walker = BodyWalker(self.program, self.source, Scope(parent, "function"), info, class_info)
            walker.walk_function(node)  # type: ignore[arg-type]
            walker.close()

    def link_loads(self, scope: Scope) -> None:
        for name, position, element, at in scope.loads:
            owner = scope.owner_of(name)
            if owner is None:
                continue
            defs = owner.defs[name]
            before = [d for d in defs if d[0] <= position] if owner is scope else defs
            # A loop can carry a later binding back to this load; when nothing precedes it, every binding can.
            reaching = before or defs
            # The nearest preceding binding wins when bindings are in straight-line order.
            if owner is scope and before and len(before) > 1 and self.straight_line(name):
                reaching = [max(before)]
            status = "proven" if len(reaching) == 1 else "partial"
            for _, origin in reaching:
                detail = f"`{name}` read here sees this binding" + ("" if status == "proven" else f" (one of {len(reaching)} that can reach it)")
                self.relate(origin, element, "references", detail, at, status)

    def straight_line(self, name: str) -> bool:
        if name not in self.straight:
            self.straight[name] = self.compute_straight_line(name)
        return self.straight[name]

    def compute_straight_line(self, name: str) -> bool:
        """Every binding of `name` sits directly in the function body (no branch or loop), so the last one before a read is the one it sees."""
        body = self.function.node.body if self.function and not isinstance(self.function.node, ast.Lambda) else []
        direct: set[int] = set()
        for stmt in body:
            for target in assigned_names(stmt):
                if target.id == name:
                    direct.add(id(target))
        total = 0
        for node in ast.walk(self.function.node) if self.function else []:
            if isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Store):
                total += 1
                if id(node) not in direct:
                    return False
        return total > 0

    def walk_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda) -> None:
        info = self.function
        source = self.source
        if info is not None and not isinstance(node, ast.Lambda):
            route = self.program_route(info)
            kind = "handler-entry" if route else "function-entry"
            span = self.span(node)
            self.element(kind, node, route["key"] if route else info.qualname, span=span, type_text=self.signature(info), type_source="annotation",
                                 attributes={"qualname": info.qualname})
            # `function-entry` is the id every call-site lookup uses; a handler keeps both.
            if kind != "function-entry":
                self.element("function-entry", node, info.qualname, span=span, type_text=self.signature(info), type_source="annotation", attributes={"qualname": info.qualname})
            self.program.scopes.setdefault(source.rel, []).append({"s": list(span.values()), "name": info.qualname, "id": info.entry_id, "kind": "function"})
            self.program.note_expression(source, node, "FunctionDef", info.qualname, self.signature(info), "annotation", span=source.name_span(node), n=node.name, d=1, f=[list(span.values())])
        for param in all_params(node.args):
            self.parameter(param, info, node)
        for default in [*node.args.defaults, *[d for d in node.args.kw_defaults if d is not None]]:
            if info is None or info.route is None:
                self.expr(default)
        if isinstance(node, ast.Lambda):
            self.expr(node.body)
            return
        self.walk_body(node.body)

    def signature(self, info: FunctionInfo) -> str | None:
        node = info.node
        if isinstance(node, ast.Lambda):
            return None
        params = []
        for param in all_params(node.args):
            if param.arg in ("self", "cls") and info.is_method:
                continue
            params.append(f"{param.arg}: {ast.unparse(param.annotation)}" if param.annotation else param.arg)
        returns = f" -> {ast.unparse(node.returns)}" if node.returns else ""
        return clip(f"({', '.join(params)}){returns}", 160)

    def program_route(self, info: FunctionInfo) -> dict[str, Any] | None:
        if info.route is not None:
            return info.route
        node = info.node
        if isinstance(node, ast.Lambda):
            return None
        for decorator in node.decorator_list:
            route = route_of(self.program, self.source, decorator, info)
            if route is not None:
                info.route = route
                self.program.routes.append({key: value for key, value in route.items() if not key.startswith("_")})
                return route
        return None

    def parameter(self, param: ast.arg, info: FunctionInfo | None, fn: ast.AST) -> None:
        annotation_text = ast.unparse(param.annotation) if param.annotation else None
        type_text, type_source = self.type_of(param)
        if type_text is None and annotation_text:
            type_text, type_source = annotation_text, "annotation"
        proof = None
        if param.annotation is not None:
            proof = {"kind": "annotation", "detail": f"{param.arg}: {annotation_text}", "locations": [self.source.location(self.span(param.annotation))]}
        element = self.element("parameter", param, param.arg, type_text=type_text, type_source=type_source, proof=proof, attributes={"name": param.arg})
        self.note(param, "arg", ty=type_text, tsrc=type_source, n=param.arg, d=1)
        self.scope.bind(param.arg, (param.lineno, param.col_offset), element)
        if info is not None and info.route is not None:
            self.request_origin(param, element, info)

    def request_origin(self, param: ast.arg, element: str, info: FunctionInfo) -> None:
        """FastAPI binds a handler's parameters from the request: path, query, body, header, or a dependency."""
        route = info.route
        assert route is not None
        if param.arg in ("self", "cls"):
            return
        kind, detail = fastapi_binding(self.program, self.source, param, info, route)
        if kind is None:
            return
        labels = {
            "path": f"path {{{param.arg}}}",
            "query": f"query ?{param.arg}",
            "body": f"request body → {param.arg}",
            "header": f"header {param.arg}",
            "cookie": f"cookie {param.arg}",
            "form": f"form field {param.arg}",
            "file": f"uploaded file {param.arg}",
            "dependency": f"dependency → {param.arg}",
            "request": "the request",
        }
        decorator_span = route["_decorator"]
        # A `parameter` with `originRole: request` is the engine's request origin; a dependency is a plain input.
        origin = self.element(
            "parameter",
            None,
            f"{route['key']} {labels.get(kind, kind)}",
            span=decorator_span,
            id_kind="request",
            suffix=f"#{param.arg}",
            type_text=self.program.elements[element]["attributes"].get("typeText"),
            type_source=self.program.elements[element]["attributes"].get("typeSource"),
            attributes={"binding": kind, "route": route["key"], "name": param.arg, **({"originRole": "request"} if kind != "dependency" else {})},
            proof={"kind": "fastapi", "detail": detail, "locations": [self.source.location(decorator_span)]},
        )
        self.relate(origin, element, "request-binding", detail, param, proof_kind="fastapi")

    # ---- statements

    def stmt(self, node: ast.stmt) -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            self.scope.bind(node.name, (node.lineno, node.col_offset), element_id("function-entry", self.source.rel, self.span(node)))
            self.pending.append((node, self.scope if self.class_info is None else (self.scope.parent or self.scope), self.class_info))
            return
        if isinstance(node, ast.ClassDef):
            self.pending.append((node, self.scope, None))
            for decorator in node.decorator_list:
                self.expr(decorator)
            for base in node.bases:
                self.expr(base)
            return
        if isinstance(node, ast.Assign):
            value = self.expr(node.value)
            for target in node.targets:
                self.bind(target, value, node.value, "carrier")
            return
        if isinstance(node, ast.AnnAssign):
            value = self.expr(node.value) if node.value is not None else None
            if node.value is not None or self.class_info is not None:
                self.bind(node.target, value, node.value or node.target, "carrier", annotation=node.annotation)
            return
        if isinstance(node, ast.AugAssign):
            value = self.expr(node.value)
            if isinstance(node.target, ast.Name):
                current = self.load_name(node.target)
                alias = self.bind(node.target, value, node.value, "carrier")
                self.relate(current, alias, "carrier", f"`{node.target.id}` keeps its earlier value", node)
            else:
                self.bind(node.target, value, node.value, "carrier")
            return
        if isinstance(node, ast.Return):
            if node.value is None:
                return
            value = self.expr(node.value)
            span = self.span(node)
            type_text, type_source = self.type_of(node.value)
            if type_text is None and self.function and not isinstance(self.function.node, ast.Lambda) and self.function.node.returns is not None:
                type_text, type_source = ast.unparse(self.function.node.returns), "annotation"
            # The kind (`return` for an entry, `return-expression` for a helper) is settled in `finish_returns`; the id is not.
            ret = self.element("return-expression", None, self.source.segment(node), span=span, id_kind="return", type_text=type_text, type_source=type_source)
            self.relate(value, ret, "return-expression", f"returned from {self.function.qualname if self.function else 'the module'}", node.value)
            return
        if isinstance(node, ast.Expr):
            self.expr(node.value)
            return
        if isinstance(node, (ast.If, ast.While)):
            self.expr(node.test)
            self.walk_body(node.body)
            self.walk_body(node.orelse)
            return
        if isinstance(node, (ast.For, ast.AsyncFor)):
            iterable = self.expr(node.iter)
            self.bind(node.target, iterable, node.iter, "for-element", alias_kind="for-binding")
            self.walk_body(node.body)
            self.walk_body(node.orelse)
            return
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                value = self.expr(item.context_expr)
                if item.optional_vars is not None:
                    self.bind(item.optional_vars, value, item.context_expr, "carrier")
            self.walk_body(node.body)
            return
        if isinstance(node, (ast.Try, getattr(ast, "TryStar", ast.Try))):
            self.walk_body(node.body)
            for handler in node.handlers:
                if handler.type is not None:
                    self.expr(handler.type)
                if handler.name:
                    self.scope.bind(handler.name, (handler.lineno, handler.col_offset), element_id("value", self.source.rel, self.span(handler)))
                self.walk_body(handler.body)
            self.walk_body(node.orelse)
            self.walk_body(node.finalbody)
            return
        if isinstance(node, ast.Raise):
            if node.exc is not None:
                self.expr(node.exc)
            return
        if isinstance(node, ast.Assert):
            self.expr(node.test)
            return
        if isinstance(node, ast.Match):
            self.expr(node.subject)
            for case in node.cases:
                if case.guard is not None:
                    self.expr(case.guard)
                self.walk_body(case.body)
            return
        if isinstance(node, ast.Delete):
            return
        # Import, Global, Nonlocal, Pass, Break, Continue: no values move.

    def bind(self, target: ast.expr, value: str | None, value_node: ast.AST, kind: str, *, alias_kind: str = "alias", annotation: ast.expr | None = None) -> str | None:
        if isinstance(target, ast.Name):
            type_text, type_source = self.type_of(target)
            proof = None
            if annotation is not None:
                type_text, type_source = type_text or ast.unparse(annotation), type_source or "annotation"
                proof = {"kind": "annotation", "detail": f"{target.id}: {ast.unparse(annotation)}", "locations": [self.source.location(self.span(annotation))]}
            alias = self.element(alias_kind, target, target.id, type_text=type_text, type_source=type_source, proof=proof, operation="alias" if alias_kind == "alias" else None)
            self.note(target, "Name", ty=type_text, tsrc=type_source, n=target.id, d=1, f=[list(self.span(value_node).values())] if value_node is not target else None)
            self.scope.bind(target.id, (target.lineno, target.col_offset), alias)
            words = {"carrier": f"assigned to `{target.id}`", "for-element": f"each item of {clip(self.source.segment(value_node), 40)} becomes `{target.id}`"}
            self.relate(value, alias, kind, words.get(kind, kind), target)
            return alias
        if isinstance(target, (ast.Tuple, ast.List)):
            for item in target.elts:
                self.bind(item.value if isinstance(item, ast.Starred) else item, value, value_node, "collection-element" if kind == "carrier" else kind, alias_kind=alias_kind)
            return None
        if isinstance(target, ast.Starred):
            return self.bind(target.value, value, value_node, kind, alias_kind=alias_kind)
        if isinstance(target, (ast.Attribute, ast.Subscript)):
            base = self.expr(target.value)
            field_name = target.attr if isinstance(target, ast.Attribute) else constant_key(target.slice)
            write = self.element("value", target, self.source.segment(target), id_kind="field-write", attributes={"property": field_name, "write": True} if field_name else {"write": True})
            self.relate(value, write, "pack-field", f"stored in {clip(self.source.segment(target), 60)}", target)
            self.relate(base, write, "carrier", "the object written to", target.value, status="partial")
            if isinstance(target, ast.Subscript):
                self.expr(target.slice)
            return write
        return None

    def load_name(self, node: ast.Name) -> str:
        span = self.span(node)
        element = element_id("value", self.source.rel, span)
        self.scope.loads.append((node.id, (node.lineno, node.col_offset), element, span))
        return element

    # ---- expressions

    def expr(self, node: ast.expr | None) -> str | None:
        if node is None:
            return None
        method = getattr(self, f"expr_{type(node).__name__}", None)
        if method is not None:
            return method(node)
        # Operators, f-strings, comparisons: a new value made from its operands.
        children = [child for child in ast.iter_child_nodes(node) if isinstance(child, ast.expr)]
        operands = [self.expr(child) for child in children]
        if not any(operands):
            return None
        kind = "predicate-result" if isinstance(node, (ast.Compare,)) or (isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not)) else "value"
        element = self.element(kind, node, self.source.segment(node))
        for child, operand in zip(children, operands):
            self.relate(operand, element, "carrier", f"{clip(self.source.segment(child), 40)} is part of {clip(self.source.segment(node), 60)}", child)
        return element

    def expr_Constant(self, node: ast.Constant) -> str | None:
        return None

    def expr_Name(self, node: ast.Name) -> str | None:
        if not isinstance(node.ctx, ast.Load):
            return None
        owner = self.scope.owner_of(node.id)
        if owner is None:
            # A module global from another module, a builtin, or an import: a function used as a value escapes.
            target = self.program.resolve_function(self.program.dotted(self.source, node))
            if target is not None:
                self.program.record_escape(target)
            return None
        bound = owner.defs[node.id]
        if all(element.startswith("py:function-entry:") for _, element in bound):
            target = self.program.functions.get(f"{self.source.module}.{node.id}")
            if target is not None:
                self.program.record_escape(target)
            return None
        element = self.load_name(node)
        # A plain read of a name repeats its binding: the anchor graph walks through it without a box of its own.
        self.element("value", node, node.id, attributes={"transparent": True})
        self.note(node, "Name")
        return element

    def expr_Attribute(self, node: ast.Attribute) -> str | None:
        if not isinstance(node.ctx, ast.Load):
            return None
        dotted = self.program.dotted(self.source, node)
        read = lookup(ORIGIN_READS, dotted)
        if read is not None:
            kind, label, attributes = read
            element = self.element(kind, node, f"{label} ({self.source.segment(node)})", attributes=attributes,
                                   proof={"kind": "import", "detail": f"{self.source.segment(node)} resolves to {dotted}", "locations": [self.source.location(self.span(node))]})
            self.note(node, "Attribute")
            return element
        if self.is_module_ref(node.value):
            # `module.function` used as a value, not a field read.
            target = self.program.resolve_function(dotted)
            if target is not None:
                self.program.record_escape(target)
            if dotted and not self.program.resolve_class(dotted):
                element = self.element("value", node, self.source.segment(node))
                self.note(node, "Attribute")
                return element
            return None
        base = self.expr(node.value)
        type_text, type_source = self.type_of(node)
        proof, field_type = self.field_declaration(node)
        if type_text is None and field_type is not None:
            type_text, type_source = field_type, "annotation"
        element = self.element("field-read", node, self.source.segment(node), operation="field-read", type_text=type_text, type_source=type_source, proof=proof,
                               attributes={"property": node.attr})
        self.note(node, "Attribute", ty=type_text, tsrc=type_source)
        self.relate(base, element, "field-input", f"reads .{node.attr} from {clip(self.source.segment(node.value), 60)}", node)
        return element

    def field_declaration(self, node: ast.Attribute) -> tuple[dict[str, Any] | None, str | None]:
        """A pydantic / dataclass field read: cite the field's declaration."""
        receiver = self.program.checked.receivers.get(self.source.rel, {}).get(span_key(self.span(node.value)))
        info = self.program.resolve_class(receiver) if receiver else None
        if info is None:
            info = self.annotated_class(node.value)
        seen = 0
        while info is not None and seen < 8:
            seen += 1
            declaration = info.fields.get(node.attr)
            if declaration is not None:
                text = ast.unparse(declaration.annotation)
                kind = "pydantic field" if info.is_model else "class attribute"
                return ({
                    "kind": "annotation",
                    "detail": f"{info.fullname.rsplit('.', 1)[-1]}.{node.attr}: {text} ({kind}, {info.source.rel}:{declaration.lineno})",
                    "locations": [info.source.location(info.source.span(declaration))],
                }, text)
            parent = next((self.program.resolve_class(base) for base in info.bases if self.program.resolve_class(base)), None)
            info = parent
        return (None, None)

    def annotated_class(self, node: ast.expr) -> ClassInfo | None:
        """The first-party class a name is annotated with, when the checker had nothing to say."""
        if not isinstance(node, ast.Name) or self.function is None or isinstance(self.function.node, ast.Lambda):
            return None
        for param in all_params(self.function.node.args):
            if param.arg == node.id and param.annotation is not None:
                return self.program.resolve_class(self.program.dotted(self.function.source, strip_optional(param.annotation)))
        return None

    def is_module_ref(self, node: ast.expr) -> bool:
        if not isinstance(node, ast.Name) or self.scope.owner_of(node.id) is not None:
            return isinstance(node, ast.Attribute) and self.is_module_ref(node.value) and (self.program.dotted(self.source, node) or "") in self.program.modules
        target = self.program.imports.get(self.source.module, {}).get(node.id)
        if target is None:
            return False
        if target in self.program.modules:
            return True
        # `import os`, `import json`: stdlib or third-party modules are not first-party classes or functions.
        return target not in self.program.functions and target not in self.program.classes and "." not in target

    def expr_Subscript(self, node: ast.Subscript) -> str | None:
        if not isinstance(node.ctx, ast.Load):
            return None
        dotted = self.program.dotted(self.source, node.value)
        key = constant_key(node.slice)
        read = lookup(ORIGIN_READS, dotted)
        if read is not None and dotted == "os.environ":
            kind, label, attributes = read
            element = self.element(kind, node, f"environment {key or self.source.segment(node.slice)}", attributes={**attributes, "name": key or "environ"},
                                   proof={"kind": "import", "detail": f"{self.source.segment(node.value)} resolves to os.environ", "locations": [self.source.location(self.span(node))]})
            self.note(node, "Subscript")
            return element
        base = self.expr(node.value)
        index = self.expr(node.slice)
        if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, (str, int)):
            metadata = {"indexKind": "string-literal" if isinstance(node.slice.value, str) else "numeric-literal", "indexValue": str(node.slice.value)}
        else:
            metadata = {"indexKind": "dynamic", "indexValue": None}
        element = self.element("index-read", node, self.source.segment(node), operation="index-read", attributes={"operation": "index-read", **metadata})
        self.note(node, "Subscript")
        self.relate(base, element, "field-input", f"reads [{clip(self.source.segment(node.slice), 30)}] from {clip(self.source.segment(node.value), 60)}", node)
        self.relate(index, element, "carrier", "the index chooses what is read", node.slice, status="partial")
        return element

    def expr_Await(self, node: ast.Await) -> str | None:
        inner = self.expr(node.value)
        if inner is None:
            return None
        element = self.element("value", node, self.source.segment(node))
        self.note(node, "Await")
        self.relate(inner, element, "carrier", "awaited", node)
        return element

    def expr_NamedExpr(self, node: ast.NamedExpr) -> str | None:
        value = self.expr(node.value)
        return self.bind(node.target, value, node.value, "carrier")

    def expr_Starred(self, node: ast.Starred) -> str | None:
        return self.expr(node.value)

    def expr_BoolOp(self, node: ast.BoolOp) -> str | None:
        operands = [(child, self.expr(child)) for child in node.values]
        element = self.element("value", node, self.source.segment(node))
        self.note(node, "BoolOp", op="or" if isinstance(node.op, ast.Or) else "and")
        for child, operand in operands:
            self.relate(operand, element, "carrier", f"{'or' if isinstance(node.op, ast.Or) else 'and'} can yield {clip(self.source.segment(child), 40)}", child)
        return element

    def expr_IfExp(self, node: ast.IfExp) -> str | None:
        self.expr(node.test)
        body, orelse = self.expr(node.body), self.expr(node.orelse)
        element = self.element("value", node, self.source.segment(node))
        self.note(node, "IfExp")
        self.relate(body, element, "carrier", f"when {clip(self.source.segment(node.test), 40)}", node.body)
        self.relate(orelse, element, "carrier", f"unless {clip(self.source.segment(node.test), 40)}", node.orelse)
        return element

    def expr_Dict(self, node: ast.Dict) -> str | None:
        element = self.element("object-pack", node, clip(self.source.segment(node), 60))
        for key, value in zip(node.keys, node.values):
            name = constant_key(key) if key is not None else None
            if key is not None:
                self.expr(key)
            carried = self.expr(value)
            self.relate(carried, element, "pack-field", f"packed as {name!r}" if name else "packed into the dict", value)
        return element

    def expr_List(self, node: ast.List | ast.Tuple | ast.Set) -> str | None:
        if not isinstance(getattr(node, "ctx", ast.Load()), ast.Load):
            return None
        items = [(child, self.expr(child)) for child in node.elts]
        if not any(item for _, item in items):
            return None
        element = self.element("object-pack", node, clip(self.source.segment(node), 60))
        for child, item in items:
            self.relate(item, element, "collection-element", "an element of the collection", child)
        return element

    expr_Tuple = expr_List
    expr_Set = expr_List

    def expr_ListComp(self, node: ast.ListComp | ast.SetComp | ast.GeneratorExp | ast.DictComp) -> str | None:
        outer = self.scope
        self.scope = Scope(outer, "comprehension")
        try:
            for generator in node.generators:
                iterable = self.expr(generator.iter)
                self.bind(generator.target, iterable, generator.iter, "for-element", alias_kind="for-binding")
                for condition in generator.ifs:
                    self.expr(condition)
            produced = [self.expr(node.key), self.expr(node.value)] if isinstance(node, ast.DictComp) else [self.expr(node.elt)]
            element = self.element("collection-element", node, clip(self.source.segment(node), 60))
            for item in produced:
                self.relate(item, element, "map-result", "each produced item", node)
            self.inner_scopes.append(self.scope)
        finally:
            self.scope = outer
        return element

    expr_SetComp = expr_ListComp
    expr_GeneratorExp = expr_ListComp
    expr_DictComp = expr_ListComp

    def expr_Lambda(self, node: ast.Lambda) -> str | None:
        self.pending.append((node, self.scope, None))
        return None

    def expr_JoinedStr(self, node: ast.JoinedStr) -> str | None:
        parts = [(value.value, self.expr(value.value)) for value in node.values if isinstance(value, ast.FormattedValue)]
        if not any(part for _, part in parts):
            return None
        element = self.element("value", node, self.source.segment(node))
        for child, part in parts:
            self.relate(part, element, "carrier", f"formatted into {clip(self.source.segment(node), 40)}", child)
        return element

    # ---- calls

    def expr_Call(self, node: ast.Call) -> str | None:
        source = self.source
        span = self.span(node)
        callee_text = source.segment(node.func)
        checked = self.program.checked.callees.get(source.rel, {}).get(span_key(span))
        dotted = self.program.dotted(source, node.func)
        target_name = checked or dotted
        function = self.program.resolve_function(target_name) or self.method_target(node)
        klass = None if function else self.program.resolve_class(target_name)
        receiver = None
        origin_receiver = isinstance(node.func, ast.Attribute) and lookup(ORIGIN_READS, self.program.dotted(source, node.func.value)) is not None
        early = lookup(TERMINAL_CALLS, target_name) or lookup(ORIGIN_CALLS, target_name)
        if early is not None and origin_receiver:
            pass  # `os.environ.get(…)`: the call is the origin, not the mapping it is called on.
        elif isinstance(node.func, ast.Attribute) and not self.is_module_ref(node.func.value) and not (dotted and (self.program.resolve_class(dotted) or self.program.resolve_function(dotted))):
            receiver = self.expr(node.func.value)
        elif not isinstance(node.func, (ast.Name, ast.Attribute)):
            receiver = self.expr(node.func)
        positional = [(arg, self.expr(arg)) for arg in node.args]
        keywords = [(kw, self.expr(kw.value)) for kw in node.keywords]
        inputs = ([(node.func, receiver)] if receiver else []) + positional + [(kw.value, value) for kw, value in keywords]
        proof_name = f"mypy resolves {callee_text} to {checked}" if checked else (f"{callee_text} resolves to {dotted} through its imports" if dotted else None)
        proof_kind = "mypy" if checked else "import"

        recognized = lookup(TERMINAL_CALLS, target_name) or lookup(ORIGIN_CALLS, target_name)
        if recognized is None and dotted and dotted != target_name:
            recognized = lookup(TERMINAL_CALLS, dotted) or lookup(ORIGIN_CALLS, dotted)
        if recognized is not None and recognized[0] == "file-input" and (target_name or "").endswith(".open") and opens_for_writing(node):
            recognized = ("file-write", "file write", {})
        if recognized is not None and function is None:
            kind, label, attributes = recognized
            element = self.element(kind, node, f"{label}: {clip(source.segment(node), 80)}",
                                   proof={"kind": proof_kind, "detail": proof_name or callee_text, "locations": [source.location(span)]},
                                   attributes={**attributes, "callee": target_name or callee_text})
            self.note(node, "Call")
            for child, value in inputs:
                self.relate(value, element, "call-input", f"handed to {callee_text}", child)
            return element

        if function is not None:
            element = self.element("call-result", node, f"{callee_text}(…)", attributes={"callee": function.entry_id, "calleeName": function.qualname},
                                   proof={"kind": proof_kind, "detail": proof_name or f"{callee_text} is {function.fullname}", "locations": [function.source.location(function.source.span(function.node))]})
            self.note(node, "Call", callee=function.entry_id)
            self.program.record_call(function, source, node.lineno)
            self.bind_arguments(function, receiver, node, positional, keywords)
            for ret in function.returns:
                if ret.value is not None:
                    ret_id = element_id("return", function.source.rel, function.source.span(ret))
                    self.program.relate(source, ret_id, element, "return-value", f"{function.qualname} returns {clip(function.source.segment(ret.value), 40)} to this call", span)
            return element

        if klass is not None:
            name = klass.fullname.rsplit(".", 1)[-1]
            kind = "object-pack" if klass.is_model else "call-result"
            type_text, type_source = self.type_of(node)
            element = self.element(kind, node, f"{name}(…)", type_text=type_text or name, type_source=type_source or "annotation", attributes={"class": klass.fullname},
                                   operation="object-pack" if klass.is_model else None,
                                   proof={"kind": proof_kind, "detail": proof_name or f"{callee_text} is {klass.fullname}", "locations": [klass.source.location(klass.source.span(klass.node))]})
            self.note(node, "Call", ty=type_text or name, tsrc=type_source or "annotation")
            fields = list(klass.fields)
            init = klass.methods.get("__init__")
            if init is not None and not klass.is_model:
                self.program.record_call(init, source, node.lineno)
                self.bind_arguments(init, None, node, positional, keywords)
            for index, (child, value) in enumerate(positional):
                label = fields[index] if index < len(fields) else None
                self.relate(value, element, "pack-field", f"{name}.{label}" if label else f"argument {index + 1} of {name}", child, status="proven" if klass.is_model else "partial")
            for kw, value in keywords:
                declared = klass.fields.get(kw.arg or "")
                detail = f"{name}.{kw.arg}" + (f": {ast.unparse(declared.annotation)}" if declared is not None else "")
                self.relate(value, element, "pack-field", detail, kw.value, status="proven" if klass.is_model else "partial")
            return element

        # Library code: the value goes in, and the result is assumed to carry it.
        type_text, type_source = self.type_of(node)
        element = self.element("call-result", node, f"{callee_text}(…)", attributes={"callee": target_name, "external": True} if target_name else {"external": True},
                               proof={"kind": proof_kind, "detail": proof_name, "locations": [source.location(span)]} if proof_name else None)
        self.note(node, "Call")
        for child, value in inputs:
            self.relate(value, element, "call-input", f"handed to {callee_text}, outside the program; its result is assumed to carry it", child, status="partial")
        return element

    def method_target(self, node: ast.Call) -> FunctionInfo | None:
        """`self.helper(x)` inside a class, when the checker had no answer."""
        func = node.func
        if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "self" and self.function and self.function.class_name:
            klass = self.program.classes.get(self.function.class_name)
            return klass.methods.get(func.attr) if klass else None
        return None

    def bind_arguments(self, function: FunctionInfo, receiver: str | None, node: ast.Call, positional: list[tuple[ast.expr, str | None]], keywords: list[tuple[ast.keyword, str | None]]) -> None:
        params = function.params
        source = function.source
        offset = 0
        if function.is_method and params and params[0].arg in ("self", "cls"):
            if receiver is not None:
                self.relate(receiver, element_id("parameter", source.rel, source.span(params[0])), "argument-binding", f"{clip(self.source.segment(node.func), 40)} binds {params[0].arg}", node.func)
            offset = 1
        named = {param.arg: param for param in params}
        fn = function.node
        positional_params = [*fn.args.posonlyargs, *fn.args.args][offset:]
        for index, (child, value) in enumerate(positional):
            if isinstance(child, ast.Starred):
                continue
            param = positional_params[index] if index < len(positional_params) else fn.args.vararg
            if param is not None:
                status = "proven" if index < len(positional_params) else "partial"
                self.relate(value, element_id("parameter", source.rel, source.span(param)), "argument-binding", f"argument {index + 1} binds {function.qualname}({param.arg})", child, status=status)
        for kw, value in keywords:
            param = named.get(kw.arg or "")
            if param is not None:
                self.relate(value, element_id("parameter", source.rel, source.span(param)), "argument-binding", f"{kw.arg}= binds {function.qualname}({param.arg})", kw.value)


def class_fullname(program: Program, source: Source, node: ast.ClassDef) -> str:
    for fullname, info in program.classes.items():
        if info.node is node:
            return fullname
    return f"{source.module}.{node.name}"


def assigned_names(stmt: ast.stmt) -> list[ast.Name]:
    targets: list[ast.expr] = []
    if isinstance(stmt, ast.Assign):
        targets = list(stmt.targets)
    elif isinstance(stmt, (ast.AnnAssign, ast.AugAssign)):
        targets = [stmt.target]
    out: list[ast.Name] = []
    for target in targets:
        out.extend(node for node in ast.walk(target) if isinstance(node, ast.Name))
    return out


def opens_for_writing(node: ast.Call) -> bool:
    """`open(path, "w")`, `path.open(mode="a")`: a write, not a read."""
    modes = [kw.value for kw in node.keywords if kw.arg == "mode"] + [arg for arg in node.args if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and len(arg.value) <= 3]
    return any(isinstance(mode, ast.Constant) and isinstance(mode.value, str) and any(flag in mode.value for flag in "wax+") for mode in modes)


def constant_key(node: ast.AST | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, int)):
        return str(node.value)
    return None


def strip_optional(node: ast.expr) -> ast.expr:
    """`Item | None`, `Optional[Item]`, `Annotated[Item, ...]` → `Item`."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left, right = node.left, node.right
        return strip_optional(right if isinstance(left, ast.Constant) and left.value is None else left)
    if isinstance(node, ast.Subscript) and dotted_name(node.value).split(".")[-1] in ("Optional", "Annotated"):
        inner = node.slice.elts[0] if isinstance(node.slice, ast.Tuple) else node.slice
        return strip_optional(inner)
    return node


# --------------------------------------------------------------------------- frameworks


def route_of(program: Program, source: Source, decorator: ast.expr, info: FunctionInfo) -> dict[str, Any] | None:
    """`@router.get("/items/{id}")`, `@app.post(...)`, `@app.route("/x", methods=["POST"])`, `@bp.get(...)`."""
    if not (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)):
        return None
    verb = decorator.func.attr
    owner = program.dotted(source, decorator.func.value)
    router = program.routers.get(owner or "")
    if router is None:
        checked = program.checked.receivers.get(source.rel, {}).get(span_key(source.span(decorator.func.value)), "")
        if checked.startswith(("fastapi.", "flask.")):
            router = {"prefix": "", "framework": "flask" if checked.startswith("flask.") else "fastapi", "mounted": ""}
    if router is None:
        return None
    if verb in HTTP_METHODS:
        methods = [verb.upper()]
    elif verb in ("route", "api_route"):
        methods = ["GET"]
        for keyword in decorator.keywords:
            if keyword.arg == "methods" and isinstance(keyword.value, (ast.List, ast.Tuple)):
                methods = [str(item.value).upper() for item in keyword.value.elts if isinstance(item, ast.Constant)]
    elif verb == "websocket":
        methods = ["WS"]
    else:
        return None
    path = ""
    if decorator.args and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.args[0].value, str):
        path = decorator.args[0].value
    for keyword in decorator.keywords:
        if keyword.arg in ("path", "rule") and isinstance(keyword.value, ast.Constant):
            path = str(keyword.value.value)
    full = f"{router['mounted']}{router['prefix']}{path}" or "/"
    pattern = f"{'|'.join(methods)} {full}"
    parameters = []
    for match in re.finditer(r"[{<]([^}>]+)[}>]", full):
        raw = match.group(1)
        name = raw.split(":")[-1] if router["framework"] == "flask" else raw.split(":")[0]
        catch_all = raw.endswith(":path") or raw.startswith("path:")
        parameters.append({"name": name, "kind": "catch-all" if catch_all else "dynamic"})
    response_model = None
    for keyword in decorator.keywords:
        if keyword.arg == "response_model":
            response_model = ast.unparse(keyword.value)
    node = info.node
    return {
        "key": pattern,
        "pathPattern": pattern,
        "file": source.rel,
        "framework": router["framework"],
        "methods": methods,
        "handler": {"name": info.qualname.rsplit(".", 1)[-1], "qualname": info.qualname, "line": node.lineno, "entryId": info.entry_id},
        "responseModel": response_model,
        "parameters": parameters,
        "_decorator": source.span(decorator),
    }


def fastapi_binding(program: Program, source: Source, param: ast.arg, info: FunctionInfo, route: dict[str, Any]) -> tuple[str | None, str]:
    """How FastAPI fills one handler parameter, by its rules: path template, explicit Query/Body/…, model type, else query."""
    if route["framework"] == "flask":
        names = {p["name"] for p in route["parameters"]}
        return ("path", f"Flask binds {param.arg} from the URL rule {route['pathPattern']}") if param.arg in names else (None, "")
    node = info.node
    assert not isinstance(node, ast.Lambda)
    path_names = {p["name"] for p in route["parameters"]}
    default = param_default(node.args, param)
    annotation = param.annotation
    explicit = None
    for marker in [default, *annotated_extras(annotation)]:
        if isinstance(marker, ast.Call):
            name = dotted_name(marker.func).split(".")[-1]
            if name in FASTAPI_PARAM_FUNCS:
                explicit = FASTAPI_PARAM_FUNCS[name]
                break
    type_name = dotted_name(strip_optional(annotation)).split(".")[-1] if annotation is not None else ""
    if explicit:
        return explicit, f"FastAPI fills {param.arg} with {explicit} input of {route['key']} (declared with {explicit.title() if explicit != 'dependency' else 'Depends'}())"
    if param.arg in path_names:
        return "path", f"FastAPI binds {param.arg} from the path template {route['key']}"
    if type_name in FASTAPI_REQUEST_TYPES:
        return "request", f"FastAPI passes the incoming request to {param.arg}: {type_name}"
    if type_name in FASTAPI_RUNTIME_TYPES:
        return None, ""
    target = strip_optional(annotation) if annotation is not None else None
    model = None
    if target is not None:
        inner = target
        if isinstance(inner, ast.Subscript) and dotted_name(inner.value).split(".")[-1] in ("list", "List", "Sequence"):
            inner = inner.slice
        model = program.resolve_class(program.dotted(source, inner))
    if model is not None and model.is_model:
        return "body", f"FastAPI parses the JSON body of {route['key']} into {param.arg}: {ast.unparse(annotation)} (a {model.fullname.rsplit('.', 1)[-1]} model)"  # type: ignore[arg-type]
    return "query", f"FastAPI reads {param.arg} from the query string of {route['key']} (a scalar parameter outside the path)"


def param_default(args: ast.arguments, param: ast.arg) -> ast.expr | None:
    positional = [*args.posonlyargs, *args.args]
    if param in positional:
        index = positional.index(param) - (len(positional) - len(args.defaults))
        return args.defaults[index] if index >= 0 else None
    if param in args.kwonlyargs:
        return args.kw_defaults[args.kwonlyargs.index(param)]
    return None


def annotated_extras(annotation: ast.expr | None) -> list[ast.expr]:
    if isinstance(annotation, ast.Subscript) and dotted_name(annotation.value).split(".")[-1] == "Annotated" and isinstance(annotation.slice, ast.Tuple):
        return list(annotation.slice.elts[1:])
    return []


# --------------------------------------------------------------------------- main


def find_types_python(root: Path) -> str | None:
    """The project's own interpreter, so mypy sees its installed packages: `.venv` or `venv` at or above the root, else VIRTUAL_ENV."""
    for folder in [root, *list(root.parents)[:2]]:
        for name in (".venv", "venv"):
            for candidate in (folder / name / "bin" / "python", folder / name / "Scripts" / "python.exe"):
                if candidate.is_file():
                    return str(candidate)
    env = os.environ.get("VIRTUAL_ENV")
    if env:
        candidate = Path(env) / "bin" / "python"
        if candidate.is_file():
            return str(candidate)
    return None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--root", required=False)
    parser.add_argument("--source")
    parser.add_argument("--types-python", help="interpreter whose site-packages mypy reads (default: the project's .venv)")
    parser.add_argument("--include-tests", action="store_true", help="also read tests/, test_*.py and conftest.py")
    parser.add_argument("--probe", action="store_true", help="report the interpreter and mypy, then exit")
    args = parser.parse_args(argv)
    python = ".".join(str(part) for part in sys.version_info[:3])
    mypy_version = mypy_available()
    if args.probe:
        print(json.dumps({"python": python, "executable": sys.executable, "mypy": mypy_version}))
        return 0 if mypy_version else 3
    if not args.root:
        parser.error("--root is required")
    if mypy_version is None:
        print(json.dumps({"python": python, "executable": sys.executable, "mypy": None, "error": "mypy is not importable in this interpreter"}))
        return 3
    root = Path(args.root).resolve()
    source_dir = Path(args.source).resolve() if args.source else root
    started = time.perf_counter()
    sources: list[Source] = []
    gaps: list[dict[str, Any]] = []
    for path, module in discover(root, source_dir, args.include_tests):
        rel = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            gaps.append({"file": rel, "reason": "unsupported-syntax", "message": f"unreadable: {exc}"})
            continue
        source = Source(path, rel, module, text)
        try:
            source.tree = ast.parse(text, filename=str(path))
        except SyntaxError as exc:
            gaps.append({"file": rel, "reason": "unsupported-syntax", "message": f"syntax error on line {exc.lineno}: {exc.msg}"})
        sources.append(source)
    parsed_ms = int((time.perf_counter() - started) * 1000)
    types_python = args.types_python or find_types_python(root)
    checked = run_mypy(sources, types_python, root)
    facts_started = time.perf_counter()
    program = Program(root, sources, checked)
    program.run()
    output = program.to_json()
    output["fileGaps"] = gaps
    output["modules"] = [source.module for source in sources]
    output["python"] = python
    output["executable"] = sys.executable
    output["checker"] = {"name": "mypy", "version": checked.version, "status": checked.status, "message": checked.message, "typesPython": types_python, "elapsedMs": checked.elapsed_ms}
    output["timings"] = {"parseMs": parsed_ms, "checkMs": checked.elapsed_ms, "factsMs": int((time.perf_counter() - facts_started) * 1000)}
    # `json.dumps` uses the C encoder; `json.dump` to a stream does not.
    sys.stdout.write(json.dumps(output, separators=(",", ":"), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
