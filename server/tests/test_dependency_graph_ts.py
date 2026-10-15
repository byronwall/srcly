from pathlib import Path

from app.services.deps.graph import build_dependency_graph
from app.services.deps.tsconfig import parse_jsonc


def write(root: Path, rel: str, text: str) -> None:
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


def test_parse_jsonc_handles_line_comments_and_trailing_commas():
    data = parse_jsonc(
        """{
      // line comment
      "compilerOptions": {
        "baseUrl": ".", /* block */
        "paths": { "@/*": ["src/*"], },
      },
    }"""
    )
    assert data["compilerOptions"]["paths"] == {"@/*": ["src/*"]}


def test_relative_index_and_js_extension_imports(tmp_path: Path):
    write(tmp_path, "src/a.ts", 'import { b } from "./b.js";\nimport { u } from "./util";\n')
    write(tmp_path, "src/b.ts", "export const b = 1;\n")
    write(tmp_path, "src/util/index.ts", "export const u = 2;\n")
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert ("src/a.ts", "src/b.ts") in edges
    assert ("src/a.ts", "src/util/index.ts") in edges
    assert edges[("src/a.ts", "src/b.ts")].symbols == ["b"]


def test_tsconfig_paths_with_comments_extends_and_references(tmp_path: Path):
    write(tmp_path, "tsconfig.json", '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }')
    write(tmp_path, "tsconfig.base.json", '{\n // shared\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } }\n}')
    write(tmp_path, "tsconfig.app.json", '{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }')
    write(tmp_path, "src/app.ts", 'import { x } from "@/lib/x";\nimport { y } from "src/lib/y";\n')
    write(tmp_path, "src/lib/x.ts", "export const x = 1;\n")
    write(tmp_path, "src/lib/y.ts", "export const y = 1;\n")
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert ("src/app.ts", "src/lib/x.ts") in edges  # paths via extends + references
    assert ("src/app.ts", "src/lib/y.ts") in edges  # bare baseUrl


def test_barrels_pass_through_to_defining_file(tmp_path: Path):
    write(tmp_path, "src/ui/Button.tsx", "export function Button() { return null; }\n")
    write(tmp_path, "src/ui/Card.tsx", "export const Card = () => null;\nexport default Card;\n")
    write(tmp_path, "src/ui/index.ts", 'export * from "./Button";\nexport { default as Card } from "./Card";\n')
    write(tmp_path, "src/page.tsx", 'import { Button, Card } from "./ui";\n')
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert ("src/page.tsx", "src/ui/Button.tsx") in edges
    assert ("src/page.tsx", "src/ui/Card.tsx") in edges
    assert edges[("src/page.tsx", "src/ui/Button.tsx")].via_barrel is True
    assert ("src/page.tsx", "src/ui/index.ts") not in edges
    # The barrel itself still depends on what it re-exports.
    assert ("src/ui/index.ts", "src/ui/Button.tsx") in edges


def test_type_only_dynamic_require_and_externals(tmp_path: Path):
    write(
        tmp_path,
        "src/main.ts",
        "\n".join(
            [
                'import type { T } from "./types";',
                'import { type U, v } from "./mixed";',
                'import * as d3 from "d3";',
                'import { css } from "@emotion/css/macro";',
                'import fs from "node:fs";',
                'const lazy = () => import("./lazy");',
                'const legacy = require("./legacy");',
            ]
        ),
    )
    write(tmp_path, "src/types.ts", "export type T = number;\n")
    write(tmp_path, "src/mixed.ts", "export type U = string;\nexport const v = 1;\n")
    write(tmp_path, "src/lazy.ts", "export default 1;\n")
    write(tmp_path, "src/legacy.js", "module.exports = 1;\n")
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert edges[("src/main.ts", "src/types.ts")].type_only is True
    assert edges[("src/main.ts", "src/mixed.ts")].type_only is None
    assert ("src/main.ts", "src/lazy.ts") in edges
    assert ("src/main.ts", "src/legacy.js") in edges
    assert ("src/main.ts", "ext:d3") in edges
    assert ("src/main.ts", "ext:@emotion/css") in edges
    assert ("src/main.ts", "ext:node") in edges
    ext = {n.id: n for n in g.nodes if n.kind == "external"}
    assert ext["ext:d3"].parent == "ext:"


def test_workspace_packages_and_test_flags(tmp_path: Path):
    write(tmp_path, "packages/core/package.json", '{ "name": "@acme/core" }')
    write(tmp_path, "packages/core/src/index.ts", "export const core = 1;\n")
    write(tmp_path, "apps/web/src/app.ts", 'import { core } from "@acme/core";\n')
    write(tmp_path, "apps/web/src/app.test.ts", 'import "./app";\n')
    g = build_dependency_graph(tmp_path, use_cache=False)
    edges = edge_map(g)
    assert ("apps/web/src/app.ts", "packages/core/src/index.ts") in edges
    nodes = {n.id: n for n in g.nodes}
    assert nodes["apps/web/src/app.test.ts"].is_test is True
    assert nodes["apps/web/src/app.ts"].is_test is False
    assert nodes["apps/web/src"].kind == "folder"
    assert nodes["apps/web/src"].parent == "apps/web"


def test_endpoint_serializes_camel_case(tmp_path: Path):
    from fastapi.testclient import TestClient

    from app.main import app

    write(tmp_path, "a.test.ts", 'import type { B } from "./b";\n')
    write(tmp_path, "b.ts", "export type B = 1;\n")
    client = TestClient(app)
    res = client.get("/api/analysis/dependency-graph", params={"path": str(tmp_path)})
    assert res.status_code == 200
    body = res.json()
    assert body["root"] == ""
    file_a = next(n for n in body["nodes"] if n["id"] == "a.test.ts")
    assert file_a["isTest"] is True and "absPath" in file_a
    assert body["edges"][0]["typeOnly"] is True


def test_parent_directory_relative_imports(tmp_path: Path):
    write(tmp_path, "src/lib/math.ts", "export const add = (a: number, b: number) => a + b;\n")
    write(tmp_path, "src/features/calc/view.ts", 'import { add } from "../../lib/math";\nexport const run = () => add(1, 2);\n')
    g = build_dependency_graph(tmp_path, use_cache=False)
    assert ("src/features/calc/view.ts#run", "src/lib/math.ts#add") in {(e.source, e.target) for e in g.edges}


def test_reporting_dependencies_use_new_contract(tmp_path: Path):
    from app.services.reporting import build_dependencies

    write(tmp_path, "a.ts", 'import { b } from "./b";\nexport const a = () => b;\n')
    write(tmp_path, "b.ts", "export const b = 1;\n")
    payload = build_dependencies(tmp_path)
    assert payload["root"] == ""
    assert {"source": "a.ts#a", "target": "b.ts#b", "symbols": ["b"]} in payload["edges"]
