"""Import-aware Python module proposals. Rope computes edits; the journal writes them."""
from __future__ import annotations

import ast
import contextlib
import json
import keyword
import sys
from pathlib import Path

from rope.base.change import ChangeContents, ChangeSet, MoveResource
from rope.base.exceptions import RopeError
from rope.base.project import Project
from rope.refactor.move import MoveModule
from rope.refactor.rename import Rename

from app.services.compare.git_refs import run_git
from app.services.refactor.plan import RefactorError, safe_path


def source_files(root: Path) -> list[str]:
    return sorted({name for name in run_git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")
                   if name.endswith(".py") and (root / name).is_file()})


def module_name(name: str) -> str:
    parts = list(Path(name).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def inspect(root: Path, action: dict | None = None) -> dict:
    files = source_files(root)
    trees: dict[str, ast.Module] = {}
    diagnostics = []
    symbols = []
    for name in files:
        path = root / name
        if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root and root in parent.parents):
            raise RefactorError(f"Python source is a symlink: {name}", code="python-symlink")
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=name)
            trees[name] = tree
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    symbols.append({"file": name, "name": node.name, "kind": type(node).__name__, "line": node.lineno})
        except (SyntaxError, UnicodeError) as exc:
            diagnostics.append({"phase": "syntax", "code": "PY_SYNTAX", "file": name, "line": getattr(exc, "lineno", 0), "message": str(exc)})
    modules = {module_name(name): name for name in files}
    edges = set()
    for name, tree in trees.items():
        for node in ast.walk(tree):
            targets = []
            if isinstance(node, ast.Import):
                targets = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                prefix = node.module or ""
                if node.level:
                    package = module_name(name).split(".") if name.endswith("/__init__.py") else module_name(name).split(".")[:-1]
                    if node.level > len(package):
                        diagnostics.append({"phase": "type", "code": "PY_IMPORT", "file": name, "line": node.lineno, "message": "Relative import escapes the selected import root."})
                        continue
                    prefix = ".".join(package[:len(package) - node.level + 1] + ([prefix] if prefix else []))
                targets = [prefix, *[f"{prefix}.{alias.name}".strip(".") for alias in node.names]]
            for target in targets:
                if target in modules:
                    edges.add((name, modules[target]))
    result = {"graph": {"files": files, "edges": [{"from": a, "to": b} for a, b in sorted(edges)]}, "symbols": symbols,
              "diagnostics": diagnostics, "validation": "Python AST syntax and Rope static import rewrites; configured checkpoints can run mypy and tests."}
    if action is None:
        return result
    if diagnostics:
        raise RefactorError("Fix Python syntax/import diagnostics before moving modules.", code="python-baseline-errors")
    if action["kind"] != "move-file":
        raise RefactorError("The Python adapter currently supports move-file for module moves and renames.", code="python-operation-unavailable")
    old, new = safe_path(action["file"]), safe_path(action["to"])
    if old not in files or not new.endswith(".py") or Path(old).name == "__init__.py" or Path(new).name == "__init__.py":
        raise RefactorError("Select an ordinary .py module; package-directory moves are not supported yet.", code="python-module-required")
    if (root / new).exists():
        raise RefactorError(f"Destination already exists: {new}", code="destination-exists")
    for name in (old, new):
        if any(not part.isidentifier() or keyword.iskeyword(part) for part in module_name(name).split(".")):
            raise RefactorError("Python module paths must contain identifier names.", code="python-module-name")
        for folder in (root / name).parent.relative_to(root).parents:
            if folder != Path(".") and not (root / folder / "__init__.py").is_file():
                raise RefactorError("Select the import root and use regular packages with __init__.py.", code="python-package-required")
        parent = (root / name).parent
        if parent != root and not (parent / "__init__.py").is_file():
            raise RefactorError("Create the destination package first; namespace packages are not supported yet.", code="python-package-required")
        if parent.resolve() != parent:
            raise RefactorError("Module destinations may not traverse symlinks.", code="python-symlink")
        while parent != root:
            initializer = ast.parse((parent / "__init__.py").read_text())
            if any(not isinstance(node, ast.Pass) and not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)) for node in initializer.body):
                raise RefactorError("Package initialization has effects or exports; moving between these packages needs an explicit initialization strategy.", code="python-package-effects")
            parent = parent.parent
    if Path(old).parent != Path(new).parent and Path(old).name != Path(new).name:
        raise RefactorError("Split a move and rename into two steps using the same file handle.", code="python-split-move-rename")
    for name, tree in trees.items():
        for node in ast.walk(tree):
            dynamic = (isinstance(node, ast.Import) and any(alias.name.startswith("importlib") for alias in node.names)) or (isinstance(node, ast.ImportFrom) and (node.module or "").startswith("importlib"))
            dynamic |= isinstance(node, ast.Name) and node.id in {"__import__", "exec", "eval"}
            if dynamic:
                raise RefactorError(f"Dynamic imports/evaluation in {name} prevent a complete static module rewrite.", code="python-dynamic-import")
            if name == old and isinstance(node, ast.Name) and node.id in {"__file__", "__name__", "__package__", "__spec__"}:
                raise RefactorError(f"{old} observes its module identity/location; supply an explicit resource strategy.", code="python-module-identity")
    try:
        with contextlib.closing(Project(str(root), ropefolder=None, save_objectdb=False, save_history=False,
                     ignored_resources=[".git", ".venv", "venv", "node_modules", "__pycache__", ".mypy_cache", ".pytest_cache"],
                     automatic_soa=False)) as project:
            resource = project.get_file(old)
            resources = [project.get_file(name) for name in files]
            if Path(old).parent == Path(new).parent:
                change_set = Rename(project, resource).get_changes(Path(new).stem, resources=resources)
            else:
                folder = Path(new).parent.as_posix()
                change_set = MoveModule(project, resource).get_changes(project.root if folder == "." else project.get_folder(folder), resources=resources)
            changes = {}

            def collect(change):
                if isinstance(change, ChangeSet):
                    for child in change.changes:
                        collect(child)
                elif isinstance(change, ChangeContents):
                    name = safe_path(change.resource.path)
                    changes[name] = {"path": name, "before": (root / name).read_bytes().decode("utf-8"), "after": change.new_contents}
                elif isinstance(change, MoveResource):
                    if change.resource.path != old or change.new_resource.path != new:
                        raise RefactorError("Rope proposed a different module destination.", code="python-unexpected-move")
                else:
                    raise RefactorError("Rope proposed an unsupported edit kind.", code="python-unsupported-edit")

            collect(change_set)
            before = (root / old).read_bytes().decode("utf-8")
            moved = changes.pop(old, {"after": before})["after"]
            changes[old] = {"path": old, "before": before, "after": None}
            changes[new] = {"path": new, "before": None, "after": moved}
            return {"changes": [changes[name] for name in sorted(changes)]}
    except RopeError as exc:
        raise RefactorError(str(exc), code="python-refactor-refused") from exc


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        print(json.dumps(inspect(Path(request["root"]), request.get("action"))))
    except (ValueError, OSError, RuntimeError) as error:
        print(json.dumps({"error": str(error), "diagnostic": getattr(error, "diagnostic", {"code": "python-refactor-refused", "message": str(error), "line": None})}))
        sys.exit(2)
