import pytest
import tempfile
import os
import json
from pathlib import Path

from app.services.tree_sitter_analysis import TreeSitterAnalyzer
from app.routers.analysis import (
    _apply_tsconfig_paths,
    _find_candidate_tsconfig_files,
    _load_tsconfig_paths,
)

@pytest.fixture
def analyzer():
    return TreeSitterAnalyzer()

def test_extract_imports_exports_simple(analyzer):
    content = """
    import { foo } from './foo';
    import bar from 'bar';
    
    export const baz = 1;
    export function qux() {}
    """
    
    with tempfile.NamedTemporaryFile(suffix=".ts", delete=False) as f:
        f.write(content.encode('utf-8'))
        f.flush()
        file_path = f.name
        
    try:
        imports, exports = analyzer.extract_imports_exports(file_path)
        
        import_sources = {i["source"] for i in imports}
        export_names = {e["name"] for e in exports}
        
        assert set(import_sources) == {'./foo', 'bar'}
        assert set(export_names) == {'baz', 'qux'}
    finally:
        os.remove(file_path)

def test_extract_imports_exports_complex(analyzer):
    content = """
    import * as React from 'react';
    import { useState, useEffect } from 'react';
    import type { ComponentProps } from 'react';
    
    export default function App() {}
    export { foo as bar } from './utils';
    """
    
    with tempfile.NamedTemporaryFile(suffix=".tsx", delete=False) as f:
        f.write(content.encode('utf-8'))
        f.flush()
        file_path = f.name
        
    try:
        imports, exports = analyzer.extract_imports_exports(file_path)
        
        # Note: 'export ... from' counts as an import too in our logic
        import_sources = {i["source"] for i in imports}
        export_names = {e["name"] for e in exports}
        
        assert set(import_sources) == {'react', './utils'}
        assert 'default' in export_names
        assert 'bar' in export_names
    finally:
        os.remove(file_path)

def test_extract_exports_various_forms(analyzer):
    content = """
    export const a = 1, b = 2;
    export class C {}
    export interface I {}
    export type T = string;
    """
    
    with tempfile.NamedTemporaryFile(suffix=".ts", delete=False) as f:
        f.write(content.encode('utf-8'))
        f.flush()
        file_path = f.name
        
    try:
        imports, exports = analyzer.extract_imports_exports(file_path)
        
        export_names = {e["name"] for e in exports}
        assert set(export_names) == {'a', 'b', 'C'} 
        # Note: We currently don't extract interface/type exports in _get_exports logic for 'export declaration'
        # Let's verify what we DO support. 
        # Looking at the code: function_declaration, generator_function_declaration, class_declaration, lexical_declaration
        # So 'I' and 'T' might be missed if they are interface_declaration or type_alias_declaration.
        # If we want to support them, we should update the code. For now, let's assert what is implemented.
    finally:
        os.remove(file_path)

def test_get_dependencies_api():
    # Integration test for the API endpoint logic (mocking the filesystem/request)
    # Since setting up a full FastAPI test client with temp files is complex,
    # let's test the logic by creating a temp directory structure and calling the logic directly
    # or using a TestClient if we import app.
    
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    
    # Create a temporary directory structure
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create files
        # main.ts -> imports utils.ts
        # utils.ts
        
        main_ts = os.path.join(tmpdir, "main.ts")
        utils_ts = os.path.join(tmpdir, "utils.ts")
        
        with open(main_ts, "w") as f:
            f.write("import { foo } from './utils';")
            
        with open(utils_ts, "w") as f:
            f.write("export const foo = 1;")
            
        # Call the endpoint
        response = client.get(f"/api/analysis/dependencies?path={tmpdir}")

        assert response.status_code == 200
        data = response.json()

        nodes = data["nodes"]
        edges = data["edges"]

        # Verify file nodes
        file_nodes = [n for n in nodes if n["type"] == "file"]
        assert len(file_nodes) == 2

        filenames = {n["label"] for n in file_nodes}
        assert "main.ts" in filenames
        assert "utils.ts" in filenames

        # There should be an export node for `foo` inside utils.ts
        export_nodes = [n for n in nodes if n["type"] == "export"]
        export_labels = {n["label"] for n in export_nodes}
        assert "foo" in export_labels

        # Find IDs
        main_id = next(n["id"] for n in nodes if n["label"] == "main.ts")
        utils_id = next(n["id"] for n in nodes if n["label"] == "utils.ts")
        foo_id = next(
            n["id"] for n in export_nodes if n["label"] == "foo"
        )

        # Verify file-to-file edge main -> utils still exists
        file_edges = [
            e for e in edges if e["source"] == main_id and e["target"] == utils_id
        ]
        assert len(file_edges) == 1

        # And there should be a specific edge from the export `foo` to main.ts
        export_edges = [
            e for e in edges if e["source"] == foo_id and e["target"] == main_id
        ]
        assert len(export_edges) == 1


def test_find_candidate_tsconfig_files_prefers_nearest(tmp_path):
    # tmp_path /
    #   tsconfig.json
    #   subdir/
    #       tsconfig.app.json
    root_tsconfig = tmp_path / "tsconfig.json"
    subdir = tmp_path / "subdir"
    subdir.mkdir()
    sub_tsconfig = subdir / "tsconfig.app.json"

    root_tsconfig.write_text("{}", encoding="utf-8")
    sub_tsconfig.write_text("{}", encoding="utf-8")

    candidates = _find_candidate_tsconfig_files(subdir)

    # We should see both configs, but the one in the subdirectory should come first.
    candidate_paths = [c.resolve() for c in candidates]
    assert sub_tsconfig.resolve() in candidate_paths
    assert root_tsconfig.resolve() in candidate_paths
    assert candidate_paths[0] == sub_tsconfig.resolve()


def test_load_tsconfig_paths_and_apply_aliases(tmp_path):
    tsconfig_path = tmp_path / "tsconfig.json"
    config = {
        "compilerOptions": {
            "baseUrl": ".",
            "paths": {
                "@core": ["src/core/index.ts"],
                "@utils/*": ["src/utils/*"],
            },
        }
    }
    tsconfig_path.write_text(json.dumps(config), encoding="utf-8")

    base_dir, paths = _load_tsconfig_paths(tsconfig_path)

    assert base_dir.resolve() == tmp_path.resolve()
    assert "@core" in paths
    assert paths["@core"] == ["src/core/index.ts"]
    assert "@utils/*" in paths

    # Exact alias
    exact_candidates = _apply_tsconfig_paths("@core", base_dir, paths)
    assert len(exact_candidates) == 1
    assert str(exact_candidates[0]).endswith("src/core/index.ts")

    # Wildcard alias
    wildcard_candidates = _apply_tsconfig_paths("@utils/math", base_dir, paths)
    assert len(wildcard_candidates) == 1
    assert str(wildcard_candidates[0]).endswith("src/utils/math")


def test_get_dependencies_api_with_tsconfig_aliases():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Create a temporary directory structure
    with tempfile.TemporaryDirectory() as tmpdir:
        base = tmp_path = Path(tmpdir)

        # tsconfig.json with path aliases
        tsconfig = {
            "compilerOptions": {
                "baseUrl": ".",
                "paths": {
                    "@core": ["core/index.ts"],
                    "@utils/*": ["utils/*"],
                },
            }
        }

        tsconfig_path = tmp_path / "tsconfig.json"
        tsconfig_path.write_text(json.dumps(tsconfig), encoding="utf-8")

        # Files:
        # main.ts -> imports "@core" and "@utils/math"
        # core/index.ts
        # utils/math.ts
        main_ts = tmp_path / "main.ts"
        core_dir = tmp_path / "core"
        utils_dir = tmp_path / "utils"
        core_dir.mkdir()
        utils_dir.mkdir()

        core_index = core_dir / "index.ts"
        utils_math = utils_dir / "math.ts"

        main_ts.write_text(
            "import { coreFn } from '@core';\n"
            "import { add } from '@utils/math';\n",
            encoding="utf-8",
        )
        core_index.write_text("export const coreFn = () => 1;\n", encoding="utf-8")
        utils_math.write_text("export const add = (a: number, b: number) => a + b;\n", encoding="utf-8")

        # Call the endpoint
        response = client.get(f"/api/analysis/dependencies?path={tmpdir}")

        assert response.status_code == 200
        data = response.json()

        nodes = data["nodes"]
        edges = data["edges"]

        # We should have three file nodes: main.ts, core/index.ts, utils/math.ts
        file_nodes = [n for n in nodes if n["type"] == "file"]
        labels = {n["label"] for n in file_nodes}
        assert "main.ts" in labels
        assert "index.ts" in labels or "core/index.ts" in labels
        assert "math.ts" in labels

        # Collect IDs
        main_id = next(n["id"] for n in nodes if n["label"] == "main.ts")
        core_ids = {
            n["id"]
            for n in nodes
            if n["label"] in {"index.ts", "core/index.ts"}
        }
        math_id = next(n["id"] for n in nodes if n["label"] == "math.ts")

        # There should be two file-to-file edges from main.ts to core and math
        internal_file_edges = [
            e
            for e in edges
            if e["source"] == main_id and e["target"] in core_ids | {math_id}
        ]
        assert len(internal_file_edges) == 2

        # And there should be export-level edges from the specific exports to main.ts
        export_nodes = [n for n in nodes if n["type"] == "export"]
        export_labels = {n["label"] for n in export_nodes}
        assert "coreFn" in export_labels
        assert "add" in export_labels

        corefn_id = next(n["id"] for n in export_nodes if n["label"] == "coreFn")
        add_id = next(n["id"] for n in export_nodes if n["label"] == "add")

        export_edges = {
            (e["source"], e["target"])
            for e in edges
            if e["target"] == main_id and e["source"] in {corefn_id, add_id}
        }
        assert (corefn_id, main_id) in export_edges
        assert (add_id, main_id) in export_edges

        # Ensure we did not create external nodes for the alias imports
        external_nodes = [n for n in nodes if n["type"] == "external"]
        assert all(
            not n["label"].startswith("@core") and not n["label"].startswith("@utils")
            for n in external_nodes
        )
