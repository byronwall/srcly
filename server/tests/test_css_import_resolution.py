from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_css_import_does_not_resolve_to_same_named_module(tmp_path: Path):
    """`import './index.css'` from index.tsx must not resolve to index.tsx itself."""
    (tmp_path / "index.tsx").write_text(
        "import { render } from 'solid-js/web'\n"
        "import './index.css'\n"
        "import App from './App.tsx'\n"
        "render(() => <App />, document.getElementById('root')!)\n",
        encoding="utf-8",
    )
    (tmp_path / "index.css").write_text("body { background: red; }", encoding="utf-8")
    (tmp_path / "App.tsx").write_text("export default function App() { return <div>Hello</div> }", encoding="utf-8")

    response = TestClient(app).get("/api/analysis/dependency-graph", params={"path": str(tmp_path)})
    assert response.status_code == 200
    edges = response.json()["edges"]
    file_of = lambda node_id: node_id.split("#")[0]

    assert not any(file_of(e["source"]) == file_of(e["target"]) for e in edges)
    assert any(file_of(e["source"]) == "index.tsx" and file_of(e["target"]) == "App.tsx" for e in edges)
    assert not any(e["target"].endswith(".css") for e in edges)
