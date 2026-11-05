"""
The symbol reference graph: who calls, instantiates, reads, writes, extends or
names whom, inside and across files. Built once per root by name (tree-sitter)
and cached by file mtimes; served as neighbourhoods, never whole.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.models import SymbolGraph, SymbolPath, SymbolSearch
from app.services.symbols.index import build_symbol_index
from app.services.symbols.model import REF_KINDS

router = APIRouter(prefix="/api/symbols", tags=["symbols"])


def _root(path: str | None) -> Path:
    target = Path(path) if path else Path.cwd()
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    return target.parent if target.is_file() else target


@router.get("/graph", response_model=SymbolGraph, response_model_exclude_none=True, response_model_by_alias=True)
def get_symbol_graph(
    path: str | None = None,
    at: str = Query(..., description="The focus symbol id: `<file>#<Qualified.name>`, or a file for its module-level code"),
    hops: int = Query(1, ge=1, le=4),
    kinds: str | None = Query(None, description="Comma-separated reference kinds to follow; default all"),
    direction: str = Query("both", pattern="^(both|in|out)$"),
    tests: bool = True,
    members: bool = Query(True, description="Draw the focus's members (a class's methods, a file's top-level symbols) with it"),
    more: str | None = Query(None, description="Comma-separated symbol ids whose own one-hop neighbourhoods join the graph (hops opened in place)"),
):
    """The focus symbol (and its members), every symbol within `hops` references of them, and the references among them."""
    chosen = None
    if kinds:
        chosen = [k for k in kinds.split(",") if k in REF_KINDS]
        if not chosen:
            raise HTTPException(status_code=400, detail=f"kinds must be some of {', '.join(REF_KINDS)}")
    index = build_symbol_index(_root(path))
    opened = [m for m in (more or "").split(",") if m]
    graph = index.neighbourhood(at, hops=hops, kinds=chosen, include_tests=tests, direction=direction, members=members, more=opened)
    if graph is None:
        raise HTTPException(status_code=404, detail=f"No symbol {at!r} in the index")
    return graph


@router.get("/search", response_model=SymbolSearch, response_model_exclude_none=True, response_model_by_alias=True)
def search_symbols(path: str | None = None, q: str = Query("", max_length=200), limit: int = Query(30, ge=1, le=200), tests: bool = True):
    """Symbols whose name, qualified name or file contains `q`, best match first, with their reference counts."""
    index = build_symbol_index(_root(path))
    return SymbolSearch(hits=index.search(q, limit=limit, include_tests=tests), index=index.info())


@router.get("/path", response_model=SymbolPath, response_model_exclude_none=True, response_model_by_alias=True)
def get_symbol_path(
    path: str | None = None,
    start: str = Query(..., alias="from", description="A symbol id"),
    end: str = Query(..., alias="to", description="A symbol id"),
    kinds: str | None = Query(None, description="Comma-separated reference kinds to follow; default all"),
    tests: bool = True,
):
    """The shortest chain of references from one symbol to another (forward, else backward), or that there is none."""
    chosen = None
    if kinds:
        chosen = [k for k in kinds.split(",") if k in REF_KINDS]
        if not chosen:
            raise HTTPException(status_code=400, detail=f"kinds must be some of {', '.join(REF_KINDS)}")
    index = build_symbol_index(_root(path))
    result = index.path(start, end, kinds=chosen, include_tests=tests)
    if result is None:
        missing = start if start not in index.symbols else end
        raise HTTPException(status_code=404, detail=f"No symbol {missing!r} in the index")
    return result
