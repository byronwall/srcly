"""
``/api/dataflow/*``: the data-flow engine behind the scan.

Plain ``def`` handlers (threadpool), like the scan endpoints: a first query can
take seconds while the engine builds its TypeScript program. Every analysis
state is a 200 with an ``outcome``; 400 is bad input and 503 means this very
request crashed the engine.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.services.dataflow import engine as dataflow_engine
from app.services.dataflow.engine import EngineCrashed, EngineError
from app.services.dataflow.models import (
    AnchorGraphResponse,
    AnchorGraphResult,
    FileExportsResponse,
    FileExportsResult,
    FunctionEffectsResponse,
    FunctionEffectsResult,
    RoutePathResponse,
    RoutePathResult,
    NA_REASONS,
    DataflowStatus,
    Outcome,
    Progress,
    RouteGraphResponse,
    RouteGraphResult,
    RoutesResponse,
    RoutesResult,
    SelectExpressionResult,
    SelectResponse,
    SourceSpan,
    ValueFlowResponse,
    ValueFlowResult,
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
        if exc.code in ("unsupported-selection", "ambiguous-selection"):
            return {"outcome": Outcome.unsupported, "reason": exc.code, "message": exc.message}
        raise HTTPException(status_code=500, detail={"reason": exc.code, "message": exc.message}) from exc


@router.get("/routes", response_model=RoutesResponse, response_model_exclude_none=True)
def get_routes(path: str | None = None, expectedGeneration: int | None = None):
    """The routes the engine discovered under ``path`` (starts the engine on first use)."""
    body = _query(_root(path), "routes", {}, expectedGeneration)
    if "result" not in body:
        return _json(RoutesResponse(**body))
    return _json(RoutesResponse(**RoutesResult.model_validate(body["result"]).model_dump()))


class RefreshRequest(BaseModel):
    path: str


@router.post("/refresh", response_model=RoutesResponse, response_model_exclude_none=True)
def refresh(body: RefreshRequest):
    """
    Rebuild tier 1 from the sources as they are now. The reply is the new
    generation's routes; every open graph must be fetched again with it, and a
    query that names the old generation gets the ``stale`` outcome.
    """
    result = _query(_root(body.path), "refresh", {}, None)
    if "result" not in result:
        return _json(RoutesResponse(**result))
    return _json(RoutesResponse(**RoutesResult.model_validate(result["result"]).model_dump()))


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


class FunctionEffectsRequest(BaseModel):
    """The function enclosing ``line`` (and ``column``, when given) in ``file``."""

    path: str
    file: str
    line: int
    column: int | None = None
    expectedGeneration: int | None = None


@router.post("/function-effects", response_model=FunctionEffectsResponse)
def function_effects(body: FunctionEffectsRequest):
    """
    What the function at a position touches (M6): its effects as facts with
    witnesses, the places the analysis could not follow as frontiers, how each
    promise-yielding call is handled, and what is assumed. Known and partial
    sit together; nothing here is a score.
    """
    root = _root(body.path)
    params: dict = {"file": _contained_file(root, body.file), "line": body.line, **({"column": body.column} if body.column else {})}
    result = _query(root, "functionEffects", params, body.expectedGeneration)
    if "result" not in result:
        return _json(FunctionEffectsResponse(**result), exclude_none=False)
    effects = FunctionEffectsResult.model_validate(result["result"])
    return _json(FunctionEffectsResponse(outcome=effects.outcome, reason=effects.reason, generation=effects.generation, programHash=effects.programHash, effects=effects), exclude_none=False)


@router.get("/route-path", response_model=RoutePathResponse)
def get_route_path(route: str, edge: str, path: str | None = None, source: str | None = None, expectedGeneration: int | None = None):
    """
    One lit edge of a route graph, explained in order (M4): the steps of the
    field attachment, frontier or handoff behind it, as ledger rows. Field
    edges need the ``source`` the graph was lit for. 404 for an edge the
    totality does not carry; steps are never invented.
    """
    params = {"route": route, "edge": edge, **({"source": source} if source else {})}
    body = _query(_root(path), "routePath", params, expectedGeneration)
    if "result" not in body:
        return _json(RoutePathResponse(**body), exclude_none=False)
    result = RoutePathResult.model_validate(body["result"])
    return _json(RoutePathResponse(outcome=result.outcome, reason=result.reason, generation=result.generation, programHash=result.programHash, path=result), exclude_none=False)


@router.get("/file-exports", response_model=FileExportsResponse)
def get_file_exports(file: str, path: str | None = None, expectedGeneration: int | None = None):
    """
    The exported declarations of a file, or of every program file under a
    folder (T19): what a file or folder anchor fans out to, one anchor
    (name and line) per export. Type-only exports are listed as not
    traceable. 404 for a path with no TypeScript program file.
    """
    root = _root(path)
    body = _query(root, "fileExports", {"file": _contained_file(root, file, folders=True)}, expectedGeneration)
    if "result" not in body:
        return _json(FileExportsResponse(**body), exclude_none=False)
    result = FileExportsResult.model_validate(body["result"])
    return _json(FileExportsResponse(outcome=result.outcome, reason=result.reason, generation=result.generation, programHash=result.programHash, exports=result), exclude_none=False)


@router.get("/route-surface", response_model=RouteGraphResponse)
def get_route_surface(route: str, path: str | None = None, expectedGeneration: int | None = None):
    """
    One route's render backbone alone (``phase: surface``): the same boxes and
    render edges as ``route-graph``, with no origins, handoffs or gaps, from the
    route file's own facts and the Program. Answers well before the first
    ``route-graph`` on a large app, so a client draws it first.
    """
    body = _query(_root(path), "routeSurface", {"route": route}, expectedGeneration)
    if "result" not in body:
        return _json(RouteGraphResponse(**body), exclude_none=False)
    graph = RouteGraphResult.model_validate(body["result"])
    return _json(RouteGraphResponse(outcome=graph.outcome, generation=graph.generation, programHash=graph.programHash, graph=graph), exclude_none=False)


@router.delete("")
def close(path: str | None = None):
    """Close the engine for ``path`` (tests, and a rescan from the folder menu)."""
    return {"closed": _registry().close(_root(path))}


def _contained_file(root: Path, file: str, folders: bool = False) -> str:
    """``file`` (absolute, or relative to the scan root) as a path relative to the root; 400 when it escapes, 404 when it is not a file (or folder, when allowed)."""
    candidate = (root / file).resolve() if not Path(file).is_absolute() else Path(file).resolve()
    try:
        relative = candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="file must be inside path") from exc
    if not (candidate.is_file() or (folders and candidate.is_dir())):
        raise HTTPException(status_code=404, detail="Folder not found" if folders else "File not found")
    return relative.as_posix()


class SelectionRequest(BaseModel):
    path: str
    file: str
    span: SourceSpan
    text: str | None = None
    expectedGeneration: int | None = None


@router.post("/select", response_model=SelectResponse)
def select_expression(body: SelectionRequest):
    """The supported expressions at a code-viewer selection or caret, innermost first."""
    root = _root(body.path)
    params = {"file": _contained_file(root, body.file), "span": body.span.model_dump(), **({"text": body.text} if body.text else {})}
    result = _query(root, "selectExpression", params, body.expectedGeneration)
    if "result" not in result:
        return _json(SelectResponse(**result), exclude_none=False)
    parsed = SelectExpressionResult.model_validate(result["result"])
    return _json(SelectResponse(outcome=parsed.outcome, reason=parsed.reason, generation=parsed.generation, programHash=parsed.programHash, result=parsed), exclude_none=False)


class ValueFlowRequest(SelectionRequest):
    direction: Literal["forward"] = "forward"


@router.post("/value-flow", response_model=ValueFlowResponse)
def value_flow(body: ValueFlowRequest):
    """
    The ledger for one selected expression: its parts (fallbacks, branches,
    assertions, calls) and where its value goes, in operation order.
    """
    root = _root(body.path)
    params = {"file": _contained_file(root, body.file), "span": body.span.model_dump(), **({"text": body.text} if body.text else {})}
    result = _query(root, "valueFlow", params, body.expectedGeneration)
    if "result" not in result:
        return _json(ValueFlowResponse(**result), exclude_none=False)
    ledger = ValueFlowResult.model_validate(result["result"])
    return _json(ValueFlowResponse(outcome=ledger.outcome, reason=ledger.reason, generation=ledger.generation, programHash=ledger.programHash, ledger=ledger), exclude_none=False)


class AnchorRequest(BaseModel):
    """An expression by exact span (plus its text), a symbol by name on a line, or a drawn box by its element id."""

    path: str
    file: str
    span: SourceSpan | None = None
    text: str | None = None
    name: str | None = None
    line: int | None = None
    elementId: str | None = None
    direction: Literal["forward", "backward", "both"] = "both"
    expectedGeneration: int | None = None


@router.post("/anchor-graph", response_model=AnchorGraphResponse)
def anchor_graph(body: AnchorRequest):
    """
    A value's neighbourhood from any expression, not a route: where it comes
    from (backward), where it goes (forward) or both, as boxes grouped by the
    function that owns them. 404 for a name that is not on its line.
    """
    root = _root(body.path)
    if body.span is None and not body.name and not body.elementId:
        raise HTTPException(status_code=422, detail="span, name and line, or elementId is required")
    params: dict = {"file": _contained_file(root, body.file), "direction": body.direction}
    if body.elementId:
        params["elementId"] = body.elementId
    elif body.span is not None:
        params["span"] = body.span.model_dump()
        if body.text:
            params["text"] = body.text
    else:
        if body.line is None:
            raise HTTPException(status_code=422, detail="name needs line")
        params["name"] = body.name
        params["line"] = body.line
    result = _query(root, "anchorGraph", params, body.expectedGeneration)
    if "result" not in result:
        return _json(AnchorGraphResponse(**result), exclude_none=False)
    graph = AnchorGraphResult.model_validate(result["result"])
    return _json(AnchorGraphResponse(outcome=graph.outcome, reason=graph.reason, generation=graph.generation, programHash=graph.programHash, graph=graph), exclude_none=False)
