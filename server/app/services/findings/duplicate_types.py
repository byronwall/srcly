"""srcly's ``duplicate-type`` rule: a local object type that copies an exported one.

A file that declares its own ``type DocDetail = { … }`` (or ``interface``)
while another file exports a ``DocDetail`` with mostly the same fields keeps a
hand-made copy of that contract. A change to the exported type does not reach
the copy, and a cast such as ``fetchDoc(id) as Promise<DocDetail>`` hides the
gap from tsc.

The rule compares top-level object types by name, then their fields by name
and declared type text (whitespace and the optional ``?`` ignored). It does not
prove the two types are the same contract: it names the exported type and how
many of the copy's fields match it, and the agent decides.

A copy is reported when all of these hold:

- it is not exported, and another non-test file exports a type of the same name;
- both are object types (``type X = { … }`` or ``interface X { … }``);
- at least ``MIN_SHARED`` of its fields match a field of that type, and at
  least half of its own fields do.

Two-field shapes such as ``Point { x, y }`` stay out: two matching fields are
too common to mean a copy. So do same-named trees such as two ``TreeNode``s
whose ``children`` point at different types. Test files and ``.d.ts`` files are skipped.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.deps.common import is_test_path
from app.services.findings.model import Finding
from app.services.findings.tools import Tool, ToolTimeout, timeout_for

EXTENSIONS = (".ts", ".tsx", ".mts", ".cts")
MIN_SHARED = 3
_MEMBERS = frozenset({"property_signature", "method_signature"})


@dataclass(frozen=True)
class ObjectType:
    name: str
    path: str
    line: int
    column: int
    exported: bool
    fields: frozenset[tuple[str, str]]
    """(name, declared type text) per property or method."""


def _parser(path: str):
    from tree_sitter import Parser

    from app.services.typescript.typescript_analysis import TSX_LANGUAGE, TYPESCRIPT_LANGUAGE

    return Parser(TSX_LANGUAGE if path.endswith(".tsx") else TYPESCRIPT_LANGUAGE)


def _field_name(member) -> Optional[str]:
    name = member.child_by_field_name("name")
    if name is None or name.type == "computed_property_name":
        return None
    text = name.text.decode("utf-8", "replace")
    if name.type == "string":
        text = text[1:-1]
    return text


def _type_text(member) -> str:
    """The declared type, without whitespace: `: string | null` for a property, the signature for a method."""
    name = member.child_by_field_name("name")
    rest = member.text[name.end_byte - member.start_byte :] if name is not None else member.text
    text = b"".join(rest.split()).decode("utf-8", "replace")
    return text.lstrip("?").rstrip(";,")


def _fields(body) -> frozenset[tuple[str, str]]:
    fields = set()
    for member in body.named_children:
        if member.type in _MEMBERS:
            name = _field_name(member)
            if name:
                fields.add((name, _type_text(member)))
    return frozenset(fields)


def _object_body(decl):
    if decl.type == "interface_declaration":
        return decl.child_by_field_name("body")
    if decl.type == "type_alias_declaration":
        value = decl.child_by_field_name("value")
        return value if value is not None and value.type == "object_type" else None
    return None


def object_types(path: str, source: bytes, rel: str) -> list[ObjectType]:
    """Top-level object types in one file, with whether each is exported."""
    root = _parser(path).parse(source).root_node
    exported_names: set[str] = set()
    found: list[tuple[object, bool]] = []
    for stmt in root.named_children:
        if stmt.type == "export_statement":
            decl = stmt.child_by_field_name("declaration")
            if decl is not None:
                found.append((decl, True))
            elif stmt.child_by_field_name("source") is None:
                for clause in (c for c in stmt.named_children if c.type == "export_clause"):
                    for spec in (s for s in clause.named_children if s.type == "export_specifier"):
                        local = spec.child_by_field_name("name")
                        if local is not None:
                            exported_names.add(local.text.decode("utf-8", "replace"))
        else:
            found.append((stmt, False))
    types: list[ObjectType] = []
    for decl, exported in found:
        body = _object_body(decl)
        name = decl.child_by_field_name("name")
        if body is None or name is None:
            continue
        text = name.text.decode("utf-8", "replace")
        types.append(
            ObjectType(
                name=text,
                path=rel,
                line=decl.start_point.row + 1,
                column=decl.start_point.column + 1,
                exported=exported or text in exported_names,
                fields=_fields(body),
            )
        )
    return types


def find_copies(types: list[ObjectType]) -> list[tuple[ObjectType, ObjectType, int]]:
    """(copy, exported original, shared field count) for every local copy of an exported type."""
    by_name: dict[str, list[ObjectType]] = defaultdict(list)
    for t in types:
        by_name[t.name].append(t)
    copies = []
    for group in by_name.values():
        originals = [t for t in group if t.exported]
        for local in (t for t in group if not t.exported):
            best: Optional[tuple[int, ObjectType]] = None
            for orig in originals:
                if orig.path == local.path:
                    continue
                shared = len(local.fields & orig.fields)
                if best is None or shared > best[0] or (shared == best[0] and orig.path < best[1].path):
                    best = (shared, orig)
            if best is None:
                continue
            shared, orig = best
            if shared >= MIN_SHARED and shared * 2 >= len(local.fields):
                copies.append((local, orig, shared))
    return sorted(copies, key=lambda c: (c[0].path, c[0].line))


def check_files(root: Path, files: list[str], tool_id: str, deadline: float) -> tuple[list[Finding], list[str]]:
    types: list[ObjectType] = []
    checked: list[str] = []
    abs_of: dict[str, str] = {}
    for path in files:
        if time.monotonic() > deadline:
            raise ToolTimeout("while reading files")
        full = (root / path).resolve()
        if not full.is_relative_to(root):
            continue
        rel = full.relative_to(root).as_posix()
        if rel.endswith(".d.ts") or is_test_path(rel):
            continue
        try:
            source = full.read_bytes()
        except OSError:
            continue
        checked.append(str(full))
        abs_of[rel] = str(full)
        types.extend(object_types(rel, source, rel))
    findings = []
    for local, orig, shared in find_copies(types):
        findings.append(
            Finding(
                abs_of[local.path],
                local.line,
                local.line,
                local.column,
                "duplicate-type",
                f"`{local.name}` copies the exported `{orig.name}` in {orig.path}:{orig.line} "
                f"({shared} of its {len(local.fields)} fields have the same name and type). Import that type, "
                f"or derive this one from it (Pick, Omit), so a change to it reaches this file.",
                "warning",
                tool_id,
            )
        )
    return findings, checked


class DuplicateTypeTool(Tool):
    def __init__(self, root: Path, files: Optional[list[str]] = None) -> None:
        super().__init__(
            id="srcly-dup-types",
            tool="srcly-dup-types",
            label="srcly duplicate types",
            source="srcly defaults",
            root=root,
            extensions=EXTENSIONS,
            timeout=timeout_for("srcly-dup-types"),
        )
        self._files = files

    def check(self):
        deadline = time.monotonic() + self.timeout
        root = self.root.resolve()
        if self._files is not None:
            files = self._files
        else:
            from app.services.analysis import discover_files

            files = [f for f in discover_files(root).files if f.endswith(EXTENSIONS)]
        return check_files(root, files, self.id, deadline)
