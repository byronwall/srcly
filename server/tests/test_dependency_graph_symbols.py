from pathlib import Path

from app.services.deps.graph import build_dependency_graph


def write(root: Path, rel: str, text: str = "") -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def pairs(graph):
    return {(e.source, e.target) for e in graph.edges}


def test_ts_edges_connect_using_function_to_defining_symbol(tmp_path: Path):
    write(tmp_path, "src/store.ts", "export const METRICS = [];\nexport type MetricId = string;\nexport function score() { return 1; }\n")
    write(tmp_path, "src/ui/index.ts", 'export * from "../store";\n')
    write(
        tmp_path,
        "src/Explorer.tsx",
        "\n".join(
            [
                'import { METRICS, score, type MetricId } from "./ui";',
                'import * as store from "./store";',
                "export function SortHeader(id: MetricId) { return METRICS.length; }",
                "export const Row = () => <div>{score()}</div>;",
                "function viaNamespace() { return store.score(); }",
                "const unusedAtTop = 1;",
            ]
        ),
    )
    g = build_dependency_graph(tmp_path, use_cache=False)
    p = pairs(g)
    assert ("src/Explorer.tsx#SortHeader", "src/store.ts#METRICS") in p
    assert ("src/Explorer.tsx#SortHeader", "src/store.ts#MetricId") in p
    assert ("src/Explorer.tsx#Row", "src/store.ts#score") in p
    assert ("src/Explorer.tsx#viaNamespace", "src/store.ts#score") in p
    nodes = {n.id: n for n in g.nodes}
    assert nodes["src/store.ts#score"].kind == "symbol"
    assert nodes["src/store.ts#score"].parent == "src/store.ts"
    assert nodes["src/store.ts#score"].symbol_kind == "function"
    assert nodes["src/Explorer.tsx#Row"].symbol_kind == "function"
    edge = next(e for e in g.edges if e.source == "src/Explorer.tsx#SortHeader" and e.target == "src/store.ts#MetricId")
    assert edge.type_only is True and edge.via_barrel is True


def test_ts_unused_and_module_level_imports_stay_file_level(tmp_path: Path):
    write(tmp_path, "a.ts", "export const A = 1;\nexport const B = 2;\n")
    write(tmp_path, "main.ts", 'import { A, B } from "./a";\nconsole.log(A);\n')
    p = pairs(build_dependency_graph(tmp_path, use_cache=False))
    assert ("main.ts", "a.ts#A") in p  # module-level use
    assert ("main.ts", "a.ts#B") in p  # imported but unused


def test_python_function_level_usage_and_module_attribute_chains(tmp_path: Path):
    write(tmp_path, "app/__init__.py")
    write(tmp_path, "app/services/__init__.py")
    write(tmp_path, "app/services/analysis.py", "def scan_codebase(p):\n    return p\n\nclass Scanner:\n    pass\n")
    write(tmp_path, "app/models.py", "class Node:\n    pass\n")
    write(
        tmp_path,
        "app/routers.py",
        "\n".join(
            [
                "from app.services import analysis",
                "from app.models import Node",
                "import app.services.analysis as an",
                "",
                "def get_tree(path) -> Node:",
                "    return analysis.scan_codebase(path)",
                "",
                "class Handler:",
                "    def run(self):",
                "        return an.Scanner()",
            ]
        ),
    )
    g = build_dependency_graph(tmp_path, use_cache=False)
    p = pairs(g)
    assert ("app/routers.py#get_tree", "app/services/analysis.py#scan_codebase") in p
    assert ("app/routers.py#get_tree", "app/models.py#Node") in p
    assert ("app/routers.py#Handler", "app/services/analysis.py#Scanner") in p
    assert ("app/routers.py", "app/services/analysis.py") not in p  # every use is resolved


def test_python_dotted_import_without_alias(tmp_path: Path):
    write(tmp_path, "pkg/__init__.py")
    write(tmp_path, "pkg/sub/__init__.py")
    write(tmp_path, "pkg/sub/mod.py", "def f():\n    return 1\n")
    write(tmp_path, "main.py", "import pkg.sub.mod\n\ndef run():\n    return pkg.sub.mod.f()\n")
    p = pairs(build_dependency_graph(tmp_path, use_cache=False))
    assert ("main.py#run", "pkg/sub/mod.py#f") in p
    assert ("main.py", "pkg/__init__.py") not in p
