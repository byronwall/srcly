"""srcly's ``copied-type-cast`` rule: a cast onto a same-name copy of the operand's type.

``fetchDoc(id) as Promise<DocDetail>`` where ``fetchDoc`` returns the
``DocDetail`` from ``docs.queries.ts`` and the file casts it to its own
``DocDetail``. The two types share a name but are two declarations, and the
cast is what keeps tsc from comparing them. ``duplicate-type`` finds the copied
declaration by its fields; this rule finds the cast that hides it, so it also
catches copies of a library type (``t.status as ChatThreadStatus`` onto a local
copy of Prisma's enum) and copies whose fields have drifted.

A cast (``x as T`` or ``<T>x``, not ``as const``) is reported when:

- the operand's type and ``T`` are both named types (a type alias, interface,
  class or enum) with the same name; for ``Promise<A> as Promise<B>`` the
  payloads ``A`` and ``B`` are compared;
- they are different symbols, so not one declaration seen twice or one
  interface merged across files;
- at least one of the two is declared in the project, not in a library or
  ``lib.d.ts`` (DOM's and Node's ``ReadableStream`` are not the project's copy).

Anonymous object types (``as { x: number }``) have no name and are left out.
The rule needs the type checker, so it runs a small Node script
(``copied_type_casts.mjs``) with the project's own ``typescript`` once per
tsconfig, for projects that install ``typescript``. Test files and ``.d.ts``
files are skipped. It is not run for portable (compare) snapshots.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Optional

from app.services.deps.common import is_test_path
from app.services.findings import typescript
from app.services.findings.model import Finding, rel_label
from app.services.findings.tools import _PRUNED_DIRS, Tool, ToolFailed, find_up, first_line, run_process, timeout_for

SCRIPT = Path(__file__).with_name("copied_type_casts.mjs")
RULE = "copied-type-cast"


def _where(file: str, line: int, root: Path) -> str:
    """A declaration as ``path:line``: relative to the root, or from the package for a library."""
    path = Path(file)
    try:
        return f"{path.relative_to(root).as_posix()}:{line}"
    except ValueError:
        pass
    parts = path.parts
    if "node_modules" in parts:
        last = len(parts) - 1 - parts[::-1].index("node_modules")
        return f"{'/'.join(parts[last + 1:])}:{line}"
    return f"{path.name}:{line}"


def _base(root: Path) -> Path:
    return root if root.is_dir() else root.parent


def parse_output(stdout: str, root: Path, tool_id: str, display: Optional[Path] = None) -> tuple[list[Finding], list[str]]:
    """The script's JSON as findings. Declarations show relative to ``display`` (the tsconfig's folder)."""
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ToolFailed(f"unreadable JSON output ({exc.msg})") from exc
    if data.get("error"):
        raise ToolFailed(str(data["error"]))
    base = _base(root)
    shown = display or base

    def keep(file: str) -> bool:
        path = Path(file)
        if path != root and root not in path.parents:
            return False
        return not is_test_path(path.relative_to(base).as_posix())

    files = [f for f in data.get("files", []) if keep(f)]
    findings = []
    for cast in data.get("casts", []):
        if not keep(cast["file"]):
            continue
        name, src, tgt = cast["name"], cast["source"], cast["target"]
        findings.append(
            Finding(
                path=cast["file"],
                line=cast["line"],
                end_line=cast["endLine"],
                column=cast["column"],
                rule=RULE,
                message=(
                    f"`{cast['text']}` casts the `{name}` from {_where(src['file'], src['line'], shown)} "
                    f"to a different `{name}`, declared in {_where(tgt['file'], tgt['line'], shown)}. "
                    f"The cast keeps tsc from comparing the two copies. Keep one declaration, import it, "
                    f"and drop the cast."
                ),
                severity="warning",
                tool=tool_id,
            )
        )
    return findings, files


_INPUTS = typescript.TS_EXTENSIONS + (".json",)


def project_inputs(directory: Path) -> str:
    """A digest of the TS and JSON files under a tsconfig's folder (path, size, mtime).

    The checker reads files outside the scanned folder (a sibling's exported
    type), so the scan's own fingerprint cannot tell when a cached result is stale.
    """
    digest = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(directory):
        dirnames[:] = sorted(d for d in dirnames if d not in _PRUNED_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            if name.endswith(_INPUTS):
                try:
                    st = os.stat(os.path.join(dirpath, name))
                except OSError:
                    continue
                digest.update(f"{dirpath}/{name}:{st.st_size}:{st.st_mtime_ns}\n".encode())
    return digest.hexdigest()[:16]


class CopiedTypeCastTool(Tool):
    rules = (RULE,)

    def __init__(self, root: Path, config: Path, node: str, label_base: Path) -> None:
        name = rel_label(config, label_base)
        super().__init__(
            id=f"srcly-casts:{name}",
            tool="srcly-casts",
            label=f"srcly copied-type casts ({name})",
            source="srcly defaults",
            root=root,
            extensions=typescript.TS_EXTENSIONS,
            timeout=timeout_for("srcly-casts"),
            signature_paths=(config, SCRIPT),
        )
        self.config = config
        self.node = node

    def signature(self) -> str:
        return f"{super().signature()}|inputs={project_inputs(self.config.parent)}"

    def check(self):
        root = self.root.resolve()
        out = run_process([self.node, str(SCRIPT), str(self.config), str(root)], self.config.parent, self.timeout)
        if out.returncode != 0:
            raise ToolFailed(first_line(out.stderr or out.stdout) or f"exit code {out.returncode}")
        return parse_output(out.stdout, root, self.id, self.config.parent)


def _configs(root: Path, stop: Optional[Path]) -> list[tuple[Path, str]]:
    """Every tsconfig for ``root``, with why the rule cannot check it (empty when it can)."""
    from app.services.dataflow.availability import locate_node

    node = locate_node()
    out = []
    for index, config in enumerate(typescript.tsconfigs(root, stop)):
        why = ""
        if index >= typescript.MAX_TSC_PROJECTS:
            why = f"over the limit of {typescript.MAX_TSC_PROJECTS} projects"
        elif not find_up(config.parent, "node_modules/typescript/package.json"):
            why = "no node_modules/typescript"
        elif node is None:
            why = "no Node on PATH (set SRCLY_NODE)"
        out.append((config, why))
    return out


def plan(root: Path, stop: Optional[Path] = None) -> list[Tool]:
    """One run per tsconfig the rule can check, as many as ``tsc`` gets."""
    from app.services.dataflow.availability import locate_node

    label_base = stop or root
    configs = [config for config, why in _configs(root, stop) if not why]
    node = locate_node() if configs else None
    return [CopiedTypeCastTool(root, config, node, label_base) for config in configs] if node else []


def unscheduled(root: Path, stop: Optional[Path] = None) -> list[tuple[str, str, str]]:
    """Configs ``plan`` leaves out: (tool, label, reason). ``srcly findings`` reads the rule's count as N/A for them."""
    label_base = stop or root
    return [
        ("srcly-casts", f"srcly copied-type casts ({rel_label(config, label_base)})", why)
        for config, why in _configs(root, stop)
        if why
    ]
