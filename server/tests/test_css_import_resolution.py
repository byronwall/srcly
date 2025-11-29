import tempfile
import os
from fastapi.testclient import TestClient
from app.main import app

def test_css_import_resolution_repro():
    client = TestClient(app)
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create index.tsx
        index_tsx = os.path.join(tmpdir, "index.tsx")
        with open(index_tsx, "w") as f:
            f.write("""
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')
render(() => <App />, root!)
            """)
            
        # Create index.css
        index_css = os.path.join(tmpdir, "index.css")
        with open(index_css, "w") as f:
            f.write("body { background: red; }")
            
        # Create App.tsx so it resolves correctly
        app_tsx = os.path.join(tmpdir, "App.tsx")
        with open(app_tsx, "w") as f:
            f.write("export default function App() { return <div>Hello</div> }")

        # Run analysis
        response = client.get(f"/api/analysis/dependencies?path={tmpdir}")
        assert response.status_code == 200
        data = response.json()
        
        nodes = data["nodes"]
        edges = data["edges"]
        
        # Find the node for index.tsx
        index_node = next((n for n in nodes if n["label"].endswith("index.tsx")), None)
        if index_node is None:
            print(f"Nodes found: {[n['label'] for n in nodes]}")
        assert index_node is not None
        
        # Check edges from index.tsx
        # We expect:
        # 1. Edge to App.tsx
        # 2. NO edge to index.tsx (self-cycle)
        # 3. Maybe an edge to index.css if we support it, or it should be ignored/external.
        
        # The bug report says "it resolves to the same file when called index.tsx".
        # So we check if there is a self-cycle.
        
        self_cycle = next((e for e in edges if e["source"] == index_node["id"] and e["target"] == index_node["id"]), None)
        
        # If the bug exists, this assertion might fail or we might find a self-cycle.
        # The user wants "It should be logged with the extension and ignored as a TS import for now."
        # So effectively, we shouldn't see it resolving to a file node that is index.tsx.
        
        assert self_cycle is None, "Found a self-cycle where index.tsx imports itself, likely due to index.css resolving to index.tsx"
        
        # Also verify it didn't resolve to index.tsx even if IDs are different (unlikely if same file path)
        # But let's check if there is any edge where target resolves to index.tsx path
        
        # Let's see what edges we have
        print("Edges:", edges)
