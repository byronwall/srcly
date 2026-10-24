"""
``/api/dataflow/*``: the data-flow engine behind the scan.

Plain ``def`` handlers (threadpool), like the scan endpoints: a first query can
take seconds while the engine builds its TypeScript program. Every analysis
state is a 200 with an ``outcome``; 400 is bad input and 503 means this very
request crashed the engine.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.services.dataflow import engine as dataflow_engine
from app.services.dataflow.engine import EngineCrashed, EngineError
from app.services.dataflow.models import (
    NA_REASONS,
    DataflowStatus,
    Outcome,
    Progress,
    RouteGraphResponse,
    RouteGraphResult,
    RoutesResponse,
    RoutesResult,
    StatusResult,
)

router = APIRouter(prefix="/api/dataflow", tags=["dataflow"])


def _registry() -> dataflow_engine.EngineRegistry:
    return dataflow_engine.registry


def _root(path: str | None) -> Path:
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    root = Path(path)
    if not root.is_absolute():
        raise HTTPException(status_code=400, detail="path must be absolute")
    if not root.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if root.is_file():
        root = root.parent
    return root.resolve()


def _json(model: BaseModel, exclude_none: bool = True) -> Response:
    # Contract payloads keep their nulls (a route node's `parent: null` is data).
    return Response(content=model.model_dump_json(exclude_none=exclude_none), media_type="application/json")


def _na(exc: EngineError) -> dict:
    reason = exc.code if exc.code in NA_REASONS else None
    return {"outcome": Outcome.not_analyzed, "reason": reason, "message": exc.message}


def _status(root: Path) -> DataflowStatus:
    registry = _registry()
    found = registry.probe(root)
    if not found.available:
        return DataflowStatus(available=False, state="na", reason=found.reason, message=found.message, node=found.node)
    failure = registry.failure(root)
    if failure is not None:
        na = _na(failure)
        return DataflowStatus(available=False, state="na", node=found.node, reason=na["reason"], message=na["message"])
    engine = registry.get(root)
    if engine is None:
        state = "starting" if registry.warming(root) else "idle"
        return DataflowStatus(available=True, state=state, node=found.node)
    hello = engine.hello or {}
    base = {
        "available": True,
        "node": found.node,
        "engine": hello.get("engine"),
        "typescript": hello.get("typescript"),
        "typescriptFrom": hello.get("typescriptFrom"),
    }
    try:
        status = StatusResult.model_validate(engine.request("status", timeout=5.0))
    except EngineError:
        # A busy or dying child still has its last progress frame.
        progress = Progress.model_validate(engine.latest_progress) if engine.latest_progress else None
        return DataflowStatus(state="starting", progress=progress, **base)
    progress = status.progress
    if progress is None and engine.latest_progress:
        progress = Progress.model_validate(engine.latest_progress)
    state = "ready" if status.built and not registry.warming(root) else ("starting" if registry.warming(root) else "running")
    return DataflowStatus(
        state=state,
        generation=status.generation,
        programHash=status.currentHash or status.programHash,
        stale=status.stale,
        rssBytes=status.rssBytes,
        progress=progress,
        **base,
    )


@router.get("/status", response_model=DataflowStatus, response_model_exclude_none=True)
def get_status(path: str | None = None):
    """Whether data flow can run for ``path`` and what the engine is doing. Never starts it."""
    return _json(_status(_root(path)))


class StartRequest(BaseModel):
    path: str


@router.post("/start", response_model=DataflowStatus, response_model_exclude_none=True)
def start(body: StartRequest):
    """Start the engine and build tier 1 in the background; poll ``status`` for progress."""
    root = _root(body.path)
    if _registry().probe(root).available:
        _registry().start_background(root)
    return _json(_status(root))


def _query(root: Path, op: str, params: dict, expected_generation: int | None) -> dict:
    """
    Run one op, turning every analysis state into a response body with an
    ``outcome``. Returns either ``{"result": ...}`` or the outcome fields.
    """
    registry = _registry()
    found = registry.probe(root)
    if not found.available:
        return {"outcome": Outcome.not_analyzed, "reason": found.reason, "message": found.message}
    known = registry.failure(root)
    if known is not None:
        return _na(known)
    try:
        return {"result": registry.query(root, op, params, expected_generation=expected_generation)}
    except EngineCrashed as exc:
        raise HTTPException(status_code=503, detail={"reason": exc.code, "message": exc.message, "stderr": exc.stderr_tail[-8:]}) from exc
    except EngineError as exc:
        if exc.code == "stale-generation":
            return {
                "outcome": Outcome.stale,
                "message": exc.message,
                "generation": exc.details.get("generation"),
                "programHash": exc.details.get("programHash"),
            }
        if exc.code == "cancelled":
            return {"outcome": Outcome.cancelled, "message": exc.message}
        if exc.code == "budget-exhausted":
            return {"outcome": Outcome.budget, "message": exc.message}
        if exc.code == "not-found":
            raise HTTPException(status_code=404, detail={"reason": exc.code, "message": exc.message}) from exc
        if exc.code in NA_REASONS:
            return _na(exc)
        raise HTTPException(status_code=500, detail={"reason": exc.code, "message": exc.message}) from exc


@router.get("/routes", response_model=RoutesResponse, response_model_exclude_none=True)
def get_routes(path: str | None = None, expectedGeneration: int | None = None):
    """The routes the engine discovered under ``path`` (starts the engine on first use)."""
    body = _query(_root(path), "routes", {}, expectedGeneration)
    if "result" not in body:
        return _json(RoutesResponse(**body))
    return _json(RoutesResponse(**RoutesResult.model_validate(body["result"]).model_dump()))


@router.get("/route-graph", response_model=RouteGraphResponse)
def get_route_graph(route: str, path: str | None = None, source: str | None = None, expectedGeneration: int | None = None):
    """
    One route's render backbone (occurrences, framework boundaries, terminals,
    origins). With ``source`` (an origin node id) it also carries that origin's
    field edges, frontiers and proven ``destinations``. The first call per route builds its totality and can take tens
    of seconds on a large app; ``status`` shows the progress meanwhile.
    """
    params = {"route": route, **({"source": source} if source else {})}
    body = _query(_root(path), "routeGraph", params, expectedGeneration)
    if "result" not in body:
        return _json(RouteGraphResponse(**body), exclude_none=False)
    graph = RouteGraphResult.model_validate(body["result"])
    return _json(RouteGraphResponse(outcome=graph.outcome, generation=graph.generation, programHash=graph.programHash, graph=graph), exclude_none=False)


@router.delete("")
def close(path: str | None = None):
    """Close the engine for ``path`` (tests, and a rescan from the folder menu)."""
    return {"closed": _registry().close(_root(path))}
