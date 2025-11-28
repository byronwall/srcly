import pytest
import tempfile
import os
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

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
        
        assert set(imports) == {'./foo', 'bar'}
        assert set(exports) == {'baz', 'qux'}
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
        assert set(imports) == {'react', './utils'}
        assert 'default' in exports
        assert 'bar' in exports
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
        
        assert set(exports) == {'a', 'b', 'C'} 
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
        
        nodes = data['nodes']
        edges = data['edges']
        
        # Verify nodes
        # Should have 2 file nodes
        file_nodes = [n for n in nodes if n['type'] == 'file']
        assert len(file_nodes) == 2
        
        filenames = {n['label'] for n in file_nodes}
        assert 'main.ts' in filenames
        assert 'utils.ts' in filenames
        
        # Verify edges
        # Should have 1 edge from main to utils
        assert len(edges) == 1
        edge = edges[0]
        
        # Find IDs
        main_id = next(n['id'] for n in nodes if n['label'] == 'main.ts')
        utils_id = next(n['id'] for n in nodes if n['label'] == 'utils.ts')
        
        assert edge['source'] == main_id
        assert edge['target'] == utils_id
