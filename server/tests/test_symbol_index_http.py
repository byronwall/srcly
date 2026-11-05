from pathlib import Path

from app.services.symbols.index import build_symbol_index


def write(root: Path, rel: str, text: str = "") -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def http(index):
    return {(r.source, r.target, r.via, r.resolution) for r in index.references if r.kind == "http"}


def test_client_requests_join_handlers_by_method_and_path(tmp_path: Path):
    write(tmp_path, "server/app/__init__.py")
    write(tmp_path, "server/app/main.py", "from fastapi import FastAPI\nfrom app.routers import items\napp = FastAPI()\napp.include_router(items.router, prefix='/api')\n")
    write(tmp_path, "server/app/routers/__init__.py")
    write(
        tmp_path,
        "server/app/routers/items.py",
        "\n".join(
            [
                "from fastapi import APIRouter",
                "router = APIRouter(prefix='/items')",
                "@router.get('/')",
                "def list_items(): pass",
                "@router.get('/{item_id}')",
                "def get_item(item_id: int): pass",
                "@router.delete('/{item_id}')",
                "def delete_item(item_id: int): pass",
                "@router.post(path='/bulk')",
                "def bulk(): pass",
                "@router.get('/special')",
                "def special(): pass",
            ]
        ),
    )
    write(tmp_path, "server/app/flask_app.py", "from flask import Flask\napp = Flask(__name__)\n@app.route('/hello', methods=['GET', 'POST'])\ndef hello(): pass\n")
    write(
        tmp_path,
        "client/src/api.ts",
        "\n".join(
            [
                "export async function listItems() { return fetch('/api/items'); }",
                "export async function getItem(id: string) { return fetch(`/api/items/${id}?full=1`); }",
                "export async function deleteItem(id: string) {",
                "  const url = new URL(`/api/items/${id}`, window.location.origin);",
                "  return fetch(url.toString(), { method: 'DELETE' });",
                "}",
                "export async function bulk() { return api.post('/api/items/bulk', {}); }",
                "export async function special() { return fetch('/api/items/special'); }",
                "export async function hello() { return fetch('/hello', { method: 'POST' }); }",
                "export async function nowhere() { return fetch('/api/nothing'); }",
                "export async function elsewhere() { return fetch('https://example.com/api/items'); }",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    s = idx.symbols
    assert s["server/app/routers/items.py#get_item"].http_methods == ["GET"] and s["server/app/routers/items.py#get_item"].http_path == "/{item_id}"
    assert s["server/app/flask_app.py#hello"].http_methods == ["GET", "POST"]
    links = http(idx)
    assert ("client/src/api.ts#listItems", "server/app/routers/items.py#list_items", "GET /api/items/", "exact") in links
    assert ("client/src/api.ts#getItem", "server/app/routers/items.py#get_item", "GET /api/items/{item_id}", "exact") in links
    assert ("client/src/api.ts#deleteItem", "server/app/routers/items.py#delete_item", "DELETE /api/items/{item_id}", "exact") in links
    assert ("client/src/api.ts#bulk", "server/app/routers/items.py#bulk", "POST /api/items/bulk", "exact") in links
    assert ("client/src/api.ts#hello", "server/app/flask_app.py#hello", "POST /hello", "exact") in links
    # A literal segment beats `{item_id}`: `special` is not a guess between two handlers.
    assert ("client/src/api.ts#special", "server/app/routers/items.py#special", "GET /api/items/special", "exact") in links
    assert not any(src.endswith("#special") and t.endswith("#get_item") for src, t, _v, _r in links)
    assert not any(src.endswith("#nowhere") or src.endswith("#elsewhere") for src, _t, _v, _r in links)
    assert idx.http_links == 6 and idx.http_unmatched == 1
    # The handler is called by the framework, not by the router: the decorator reads the router only.
    assert ("server/app/routers/items.py#get_item", "read", "server/app/routers/items.py#router") in {(r.source, r.kind, r.target) for r in idx.references}
    g = idx.neighbourhood("server/app/routers/items.py#get_item", hops=1)
    edge = next(e for e in g.edges if e.kind == "http")
    assert edge.via == "GET /api/items/{item_id}" and edge.source == "client/src/api.ts#getItem"
    assert g.index.http_links == 6


def test_ambiguous_requests_are_guesses_and_a_router_without_mount_keeps_its_prefix(tmp_path: Path):
    write(tmp_path, "a.py", "from fastapi import APIRouter\nrouter = APIRouter(prefix='/x')\n@router.get('/{a}')\ndef one(a): pass\n@router.get('/{b}')\ndef two(b): pass\n")
    write(tmp_path, "c.ts", "export function go() { return fetch('/x/1'); }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    links = http(idx)
    assert {(t, r) for _s, t, _v, r in links} == {("a.py#one", "name"), ("a.py#two", "name")}
    assert idx.http_links == 1
