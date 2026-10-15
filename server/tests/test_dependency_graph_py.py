from pathlib import Path

from app.services.deps.graph import build_dependency_graph
from app.services.deps.python_deps import find_source_roots


def write(root: Path, rel: str, text: str = "") -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def edge_map(graph):
    """File-level view of the graph: symbol endpoints (`file#name`) collapse to files."""
    from app.models import DepGraphEdge

    out = {}
    for e in graph.edges:
        key = (e.source.split("#")[0], e.target.split("#")[0])
        cur = out.get(key)
        if cur is None:
            out[key] = DepGraphEdge(
                source=key[0], target=key[1], symbols=list(e.symbols or []) or None,
                type_only=e.type_only, via_barrel=e.via_barrel,
            )
        else:
            cur.symbols = list(dict.fromkeys([*(cur.symbols or []), *(e.symbols or [])])) or None
            cur.type_only = (cur.type_only and e.type_only) or None
            cur.via_barrel = (cur.via_barrel or e.via_barrel) or None
    return out


def make_src_layout(root: Path) -> None:
    write(root, "pyproject.toml", "[project]\nname='acme'\n")
    write(root, "src/acme/__init__.py", "from .core.engine import Engine\n__all__ = ['Engine']\n")
    write(root, "src/acme/core/__init__.py")
    write(root, "src/acme/core/engine.py", "from ..util import helpers\nfrom . import config\n\nclass Engine:\n    pass\n")
    write(root, "src/acme/core/config.py", "VALUE = 1\n")
    write(root, "src/acme/util/__init__.py")
    write(root, "src/acme/util/helpers.py", "def helper():\n    return 1\n")


def test_src_layout_roots_and_relative_imports(tmp_path: Path):
    make_src_layout(tmp_path)
    files = sorted(tmp_path.rglob("*.py"))
    roots = find_source_roots(tmp_path.resolve(), [f.resolve() for f in files])
    assert (tmp_path / "src").resolve() in roots
    edges = edge_map(build_dependency_graph(tmp_path, use_cache=False))
    assert ("src/acme/core/engine.py", "src/acme/util/helpers.py") in edges  # from ..util import helpers
    assert ("src/acme/core/engine.py", "src/acme/core/config.py") in edges  # from . import config


def test_absolute_imports_and_init_reexports_pass_through(tmp_path: Path):
    make_src_layout(tmp_path)
    write(tmp_path, "src/acme/cli.py", "from acme import Engine\nimport acme.util.helpers as h\nfrom acme.core.config import VALUE\n")
    edges = edge_map(build_dependency_graph(tmp_path, use_cache=False))
    e = edges[("src/acme/cli.py", "src/acme/core/engine.py")]
    assert e.via_barrel is True and e.symbols == ["Engine"]
    assert ("src/acme/cli.py", "src/acme/__init__.py") not in edges
    assert ("src/acme/cli.py", "src/acme/util/helpers.py") in edges
    assert edges[("src/acme/cli.py", "src/acme/core/config.py")].symbols == ["VALUE"]
    # The package __init__ itself still depends on what it re-exports.
    assert ("src/acme/__init__.py", "src/acme/core/engine.py") in edges


def test_type_checking_lazy_star_and_externals(tmp_path: Path):
    write(tmp_path, "app/__init__.py")
    write(tmp_path, "app/models.py", "class User: ...\n")
    write(tmp_path, "app/shared.py", "X = 1\n")
    write(tmp_path, "app/lazy.py", "Y = 2\n")
    write(
        tmp_path,
        "app/service.py",
        "\n".join(
            [
                "from __future__ import annotations",
                "import os",
                "from typing import TYPE_CHECKING",
                "from fastapi import APIRouter",
                "from app.shared import *",
                "if TYPE_CHECKING:",
                "    from app.models import User",
                "def run():",
                "    from app import lazy",
                "    return lazy.Y",
            ]
        ),
    )
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert edges[("app/service.py", "app/models.py")].type_only is True
    assert ("app/service.py", "app/lazy.py") in edges
    assert edges[("app/service.py", "app/shared.py")].symbols == ["*"]
    assert ("app/service.py", "ext:fastapi") in edges
    assert ("app/service.py", "ext:os") in edges
    assert ("app/service.py", "ext:typing") in edges


def test_namespace_packages_and_flat_scripts(tmp_path: Path):
    # No __init__.py anywhere: implicit namespace packages / script folders.
    write(tmp_path, "tools/report.py", "from tools import fmt\nimport helpers\n")
    write(tmp_path, "tools/fmt.py", "def fmt(): ...\n")
    write(tmp_path, "helpers.py", "def h(): ...\n")
    edges = edge_map(build_dependency_graph(tmp_path, use_cache=False))
    assert ("tools/report.py", "tools/fmt.py") in edges
    assert ("tools/report.py", "helpers.py") in edges


def test_python_test_files_are_flagged(tmp_path: Path):
    write(tmp_path, "pkg/__init__.py")
    write(tmp_path, "pkg/core.py", "A = 1\n")
    write(tmp_path, "tests/test_core.py", "from pkg.core import A\n")
    write(tmp_path, "pkg/core_test.py", "from pkg.core import A\n")
    write(tmp_path, "conftest.py", "")
    g = build_dependency_graph(tmp_path, use_cache=False)
    nodes = {n.id: n for n in g.nodes}
    assert nodes["tests/test_core.py"].is_test is True
    assert nodes["pkg/core_test.py"].is_test is True
    assert nodes["conftest.py"].is_test is True
    assert nodes["pkg/core.py"].is_test is False
    assert nodes["pkg/core.py"].language == "py"
    assert ("tests/test_core.py", "pkg/core.py") in edge_map(g)


def test_srcly_server_seams(tmp_path: Path):
    """Real-world check on this repository's own server package."""
    server = Path(__file__).resolve().parents[1]
    edges = edge_map(build_dependency_graph(server, use_cache=False))
    assert ("app/routers/analysis.py", "app/models.py") in edges
    assert ("app/routers/analysis.py", "app/services/deps/graph.py") in edges
    assert ("app/main.py", "app/routers/analysis.py") in edges
    assert not any(s.startswith("app/static/") for s, _ in edges)  # gitignored build output
