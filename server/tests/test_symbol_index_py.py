from pathlib import Path

from app.services.symbols.index import build_symbol_index


def write(root: Path, rel: str, text: str = "") -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def refs(index):
    return {(r.source, r.kind, r.target, r.resolution) for r in index.references}


def test_classes_methods_fields_and_self(tmp_path: Path):
    write(tmp_path, "app/__init__.py")
    write(
        tmp_path,
        "app/store.py",
        "\n".join(
            [
                "class Base:",
                "    def row(self): return 1",
                "",
                "class Store(Base):",
                "    count: int = 0",
                "    def __init__(self):",
                "        self.items = []",
                "    def bump(self, n=1):",
                "        self.count += n",
                "        self.save()",
                "        super().row()",
                "        Store.make()",
                "        return self.items",
                "    def save(self): return self.count",
                "    @staticmethod",
                "    def make(): return Store()",
                "    @property",
                "    def total(self): return self.count",
                "    @total.setter",
                "    def total(self, v): self.count = v",
                "",
                "store = Store()",
                "store.bump()",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    s = idx.symbols
    assert s["app/store.py#Store.bump"].kind == "method" and s["app/store.py#Store.bump"].container == "app/store.py#Store"
    assert s["app/store.py#Store.count"].kind == "field"
    assert s["app/store.py#Store.items"].kind == "field" and s["app/store.py#Store.items"].line == 7
    assert s["app/store.py#store"].typed_as == "app/store.py#Store"
    assert s["app/store.py#Store"].bases == ["app/store.py#Base"]
    r = refs(idx)
    assert ("app/store.py#Store", "extends", "app/store.py#Base", "exact") in r
    assert ("app/store.py#Store.bump", "write", "app/store.py#Store.count", "exact") in r
    assert ("app/store.py#Store.bump", "call", "app/store.py#Store.save", "exact") in r
    assert ("app/store.py#Store.bump", "call", "app/store.py#Base.row", "exact") in r
    assert ("app/store.py#Store.bump", "call", "app/store.py#Store.make", "exact") in r
    assert ("app/store.py#Store.bump", "read", "app/store.py#Store.items", "exact") in r
    assert ("app/store.py#Store.make", "instantiate", "app/store.py#Store", "exact") in r
    assert ("app/store.py#Store.total", "write", "app/store.py#Store.count", "exact") in r
    assert ("app/store.py#store", "instantiate", "app/store.py#Store", "exact") in r
    assert ("app/store.py", "call", "app/store.py#Store.bump", "typed") in r
    # Only one `total` symbol for the getter and setter; the decorator names no reference.
    assert sum(1 for sym in s.values() if sym.name == "total") == 1


def test_cross_module_references_through_packages_and_init(tmp_path: Path):
    write(tmp_path, "pkg/__init__.py", "from .models import Node\n")
    write(tmp_path, "pkg/models.py", "class Node:\n    def walk(self): pass\n\nLIMIT = 3\n")
    write(tmp_path, "pkg/util/__init__.py")
    write(tmp_path, "pkg/util/log.py", "def log(x): pass\n")
    write(
        tmp_path,
        "pkg/app.py",
        "\n".join(
            [
                "from pkg import Node",
                "from pkg import models",
                "import pkg.util.log as logging",
                "import pkg.util",
                "from typing import TYPE_CHECKING",
                "",
                "def run(n: Node) -> Node:",
                "    n.walk()",
                "    logging.log(models.LIMIT)",
                "    pkg.util.log.log(1)",
                "    models.LIMIT = 4",
                "    return Node()",
                "",
                "def local_import():",
                "    from pkg.models import LIMIT",
                "    return LIMIT",
                "",
                "class Sub(models.Node):",
                "    pass",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    r = refs(idx)
    assert ("pkg/app.py#run", "type", "pkg/models.py#Node", "exact") in r
    assert ("pkg/app.py#run", "call", "pkg/models.py#Node.walk", "typed") in r
    assert ("pkg/app.py#run", "call", "pkg/util/log.py#log", "exact") in r
    assert ("pkg/app.py#run", "read", "pkg/models.py#LIMIT", "exact") in r
    assert ("pkg/app.py#run", "write", "pkg/models.py#LIMIT", "exact") in r
    assert ("pkg/app.py#run", "instantiate", "pkg/models.py#Node", "exact") in r
    assert ("pkg/app.py#local_import", "read", "pkg/models.py#LIMIT", "exact") in r
    assert ("pkg/app.py#Sub", "extends", "pkg/models.py#Node", "exact") in r
    assert idx.symbols["pkg/app.py#Sub"].bases == ["pkg/models.py#Node"]


def test_scoping_globals_decorators_and_name_only_members(tmp_path: Path):
    write(tmp_path, "m.py", "class A:\n    def only(self): pass\n    def shared(self): pass\nclass B:\n    def shared(self): pass\n")
    write(
        tmp_path,
        "f.py",
        "\n".join(
            [
                "import functools",
                "COUNT = 0",
                "def deco(fn): return fn",
                "@deco",
                "def bump():",
                "    global COUNT",
                "    COUNT += 1",
                "    COUNT = COUNT + 1",
                "def shadow():",
                "    COUNT = 5",
                "    return COUNT",
                "def members(x):",
                "    x.only()",
                "    x.shared()",
                "    return x.items",
                "@functools.lru_cache",
                "def cached(): return [c for c in COUNT]",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    r = refs(idx)
    assert ("f.py#bump", "call", "f.py#deco", "exact") in r
    assert ("f.py#bump", "write", "f.py#COUNT", "exact") in r
    assert ("f.py#bump", "read", "f.py#COUNT", "exact") in r
    assert not any(s == "f.py#shadow" for s, _k, _t, _r in r)
    assert ("f.py#members", "call", "m.py#A.only", "name") in r
    assert not any(t.endswith("shared") or t.endswith("items") for _s, _k, t, _r in r)
    assert ("f.py#cached", "read", "f.py#COUNT", "exact") in r
    assert idx.symbols["f.py#COUNT"].exported and not idx.symbols["f.py#COUNT"].kind == "module"


def test_mixed_repo_indexes_both_languages(tmp_path: Path):
    write(tmp_path, "client/a.ts", "export function a() {}\n")
    write(tmp_path, "server/b.py", "def b(): pass\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    assert idx.symbols["client/a.ts#a"].language == "ts" and idx.symbols["server/b.py#b"].language == "py"
    assert idx.info().files == 2
