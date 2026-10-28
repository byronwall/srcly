"""
Pydantic mirrors of the engine's op results, plus the API's own responses.

The engine's Zod contracts are the source of truth; ``pnpm emit-contracts``
writes them to ``contracts/*.schema.json``. The engine-result models here are
hand-written for readability, and ``tests/test_dataflow_models.py`` asserts
that each one's fields equal its schema's properties.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Outcome(str, Enum):
    """The query outcome, one per reply (plan section 3.4)."""

    ok = "ok"
    partial = "partial"
    not_analyzed = "not-analyzed"
    unsupported = "unsupported"
    stale = "stale"
    cancelled = "cancelled"
    budget = "budget"


class EvidenceStatus(str, Enum):
    proven = "proven"
    partial = "partial"
    unsupported = "unsupported"


# Mirrors ENGINE_ERROR_CODES in engine/src/srcly/protocol.ts.
EngineErrorCode = Literal[
    "invalid-request",
    "no-tsconfig",
    "non-strict-tsconfig",
    "no-ts-files",
    "typescript-not-found",
    "python-not-found",
    "python-checker-not-found",
    "no-python-files",
    "stale-generation",
    "not-found",
    "unsupported-selection",
    "ambiguous-selection",
    "cancelled",
    "budget-exhausted",
    "memory-limit",
    "internal",
]

# Why a root has no data-flow answer. The first three are decided without
# spawning (availability.py); the rest come from the child or its supervision.
NaReason = Literal[
    "node-not-found",
    "engine-missing",
    "no-tsconfig",
    "non-strict-tsconfig",
    "no-ts-files",
    "typescript-not-found",
    "python-not-found",
    "python-checker-not-found",
    "no-python-files",
    "engine-crashed",
    "timed-out",
    "engine-protocol-mismatch",
    "memory-limit",
]

NA_REASONS: frozenset[str] = frozenset(NaReason.__args__)  # type: ignore[attr-defined]


# ---- engine results (contracts/*.schema.json) -------------------------------


class Progress(BaseModel):
    phase: Literal["queued", "program", "identity", "trace", "summarize", "routes", "project"]
    message: str
    completed: int | None = None
    total: int | None = None


class HelloResult(BaseModel):
    protocol: int
    engine: str
    node: str
    typescript: str
    typescriptFrom: Literal["project", "bundled"]
    root: str
    source: str


class StatusResult(BaseModel):
    protocol: int
    built: bool
    generation: int | None
    programHash: str | None
    currentHash: str | None
    stale: bool
    rssBytes: int
    progress: Progress | None


class RouteParameter(BaseModel):
    name: str
    kind: Literal["dynamic", "catch-all"]


class RouteHandler(BaseModel):
    name: str
    line: int


class RouteSummary(BaseModel):
    key: str
    pathPattern: str
    file: str
    absPath: str
    parameters: list[RouteParameter]
    # A handler route (FastAPI, Flask) has no render backbone; the client anchors at its handler.
    handler: RouteHandler | None = None
    # A page route's component (its file's default export); the client traces its data from there.
    component: RouteHandler | None = None


class RoutesResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    routes: list[RouteSummary]


# ---- API responses -----------------------------------------------------------


class DataflowStatus(BaseModel):
    """``GET /api/dataflow/status``. Never starts the engine."""

    available: bool
    # idle: can start, not running · starting: building tier 1 · ready: tier 1 built
    # running: alive, tier 1 not built yet · na: cannot run here (see reason)
    state: Literal["idle", "starting", "running", "ready", "na"]
    reason: NaReason | None = None
    message: str | None = None
    node: str | None = None
    engine: str | None = None
    typescript: str | None = None
    typescriptFrom: Literal["project", "bundled"] | None = None
    generation: int | None = None
    programHash: str | None = None
    stale: bool = False
    rssBytes: int | None = None
    progress: Progress | None = None
    # Python apps below a root analyzed as TypeScript, relative to it: where to open their data flow.
    pythonApps: list[str] | None = None
    # Which language the root is analyzed as, so the client words what it shows for it.
    language: Literal["typescript", "python"] | None = None


class RoutesResponse(BaseModel):
    """``GET /api/dataflow/routes``. 200 for every analysis state; the outcome says which."""

    outcome: Outcome
    reason: NaReason | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    tsconfig: str | None = None
    typescript: str | None = None
    routes: list[RouteSummary] = []


# ---- route graph (contracts/routeGraph.schema.json) ---------------------------


class SourceSpan(BaseModel):
    startLine: int
    startColumn: int
    endLine: int
    endColumn: int


class SourceLocation(BaseModel):
    file: str
    line: int
    column: int
    span: SourceSpan


class EvidenceProof(BaseModel):
    kind: str
    detail: str
    locations: list[SourceLocation]
    status: EvidenceStatus


class FlowNode(BaseModel):
    id: str
    kind: Literal["route", "occurrence", "control", "origin", "field", "terminal", "frontier"]
    label: str
    detail: str | None
    parent: str | None
    file: str
    absPath: str
    line: int
    span: SourceSpan
    status: EvidenceStatus
    collapsedByDefault: bool
    repetition: Literal["single", "conditional", "collection", "unknown"] | None
    external: bool
    reason: str | None


class PathIds(BaseModel):
    elements: list[str]
    relations: list[str]


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: Literal["render", "handoff", "field"]
    label: str | None
    status: EvidenceStatus
    proof: list[EvidenceProof]
    pathIds: PathIds | None


class RouteRef(BaseModel):
    key: str
    pathPattern: str
    file: str
    absPath: str


class RouteOrigin(BaseModel):
    nodeId: str
    elementId: str
    roles: list[str]
    label: str
    status: EvidenceStatus


class RouteGraphCounts(BaseModel):
    occurrences: int
    boundaries: int
    terminals: int
    origins: int
    handoffs: int
    omittedItems: int


class RouteGap(BaseModel):
    reason: str
    label: str
    location: SourceLocation | None


class RouteLineage(BaseModel):
    status: Literal["complete", "partial", "unavailable"]
    unavailableReason: str | None
    fields: int
    frontiers: int


class RouteGraphResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    # surface: the render backbone alone, before the program-wide evidence; complete: the whole totality.
    phase: Literal["surface", "complete"]
    route: RouteRef
    status: Literal["complete", "partial", "unavailable"]
    unavailableReason: str | None
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    origins: list[RouteOrigin]
    selectedSource: str | None
    lineage: RouteLineage | None
    destinations: list[str]
    counts: RouteGraphCounts
    gaps: list[RouteGap]


class RouteGraphResponse(BaseModel):
    """``GET /api/dataflow/route-graph``: the graph, or an outcome without one."""

    outcome: Outcome
    reason: NaReason | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    graph: RouteGraphResult | None = None


# ---- value flow (contracts/selectExpression.schema.json, valueFlow.schema.json) -----


class SelectCandidate(BaseModel):
    kind: str
    text: str
    span: SourceSpan
    evidence: bool


class SelectExpressionResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    file: str
    reason: str | None
    candidates: list[SelectCandidate]


class LedgerRow(BaseModel):
    id: str
    kind: Literal["input", "transfer", "fallback", "branch", "transform", "terminal", "boundary"]
    label: str
    file: str
    absPath: str
    line: int
    span: SourceSpan
    status: EvidenceStatus
    elementId: str | None
    relationId: str | None
    proof: list[EvidenceProof]
    typeText: str | None
    note: str | None
    reason: str | None


class LedgerSelection(BaseModel):
    file: str
    span: SourceSpan
    text: str
    kind: str


class LedgerFrontier(BaseModel):
    rowId: str
    reason: str
    label: str


class LedgerBudget(BaseModel):
    limit: int
    used: int
    exhausted: bool


class LedgerCoverage(BaseModel):
    elements: int
    relations: int
    budget: LedgerBudget


class SourceFingerprint(BaseModel):
    file: str
    size: int
    mtimeMs: float


class LedgerBindings(BaseModel):
    tsconfig: str
    typescript: str
    sourceFingerprints: list[SourceFingerprint]


class ValueFlowResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    reason: str | None
    selection: LedgerSelection
    rows: list[LedgerRow]
    frontiers: list[LedgerFrontier]
    terminals: list[str]
    coverage: LedgerCoverage
    bindings: LedgerBindings


class SelectResponse(BaseModel):
    """``POST /api/dataflow/select``: candidates, or an outcome without them."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    result: SelectExpressionResult | None = None


class ValueFlowResponse(BaseModel):
    """``POST /api/dataflow/value-flow``: the ledger, or an outcome without one."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    ledger: ValueFlowResult | None = None


# ---- route path (contracts/routePath.schema.json) ----------------------------


class RoutePathEdge(BaseModel):
    id: str
    kind: Literal["field", "handoff"]
    label: str | None
    status: EvidenceStatus
    source: str
    target: str


class RoutePathFrontier(BaseModel):
    reason: str
    label: str


class RoutePathRoute(BaseModel):
    key: str
    pathPattern: str


class RoutePathResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    reason: str | None
    route: RoutePathRoute
    edge: RoutePathEdge
    rows: list[LedgerRow]
    proof: list[EvidenceProof]
    frontier: RoutePathFrontier | None


class RoutePathResponse(BaseModel):
    """``GET /api/dataflow/route-path``: one lit edge, explained in order."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    path: RoutePathResult | None = None


# ---- file exports (contracts/fileExports.schema.json) -------------------------


class FileExport(BaseModel):
    id: str
    name: str
    kind: Literal["function", "class", "variable", "component", "enum", "type", "interface", "namespace", "other"]
    file: str
    absPath: str
    line: int
    column: int
    traceable: bool
    reexported: bool


class FileExportsFile(BaseModel):
    file: str
    absPath: str
    exports: list[FileExport]


class FileExportsTarget(BaseModel):
    path: str
    absPath: str
    kind: Literal["file", "folder"]


class FileExportsCounts(BaseModel):
    files: int
    exports: int
    traceable: int


class FileExportsResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    reason: str | None
    target: FileExportsTarget
    files: list[FileExportsFile]
    counts: FileExportsCounts


class FileExportsResponse(BaseModel):
    """``GET /api/dataflow/file-exports``: a file's or folder's exports, one anchor each."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    exports: FileExportsResult | None = None


# ---- function effects (contracts/functionEffects.schema.json) ----------------


class EffectWitness(BaseModel):
    file: str
    absPath: str
    line: int
    span: SourceSpan
    text: str


class EffectVia(BaseModel):
    callable: str
    file: str
    line: int


class EffectFact(BaseModel):
    id: str
    family: Literal["external", "input", "write", "throw", "timer", "promise"]
    kind: str
    label: str
    detail: str
    status: Literal["proven", "partial"]
    activation: Literal["direct", "after-await", "timer", "latent"]
    via: list[EffectVia]
    witness: EffectWitness


class EffectFrontier(BaseModel):
    id: str
    reason: str
    label: str
    detail: str
    via: list[EffectVia]
    witness: EffectWitness


class ResultHandling(BaseModel):
    callee: str
    handling: Literal["awaited", "returned", "assigned", "passed", "discarded"]
    witness: EffectWitness


class EffectCallable(BaseModel):
    name: str
    kind: Literal["function", "arrow", "method", "getter", "setter", "constructor"]
    async_: bool = Field(alias="async")
    file: str
    absPath: str
    line: int
    span: SourceSpan

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class EffectCounts(BaseModel):
    facts: int
    frontiers: int
    callables: int


class FunctionEffectsResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    reason: str | None
    callable: EffectCallable
    facts: list[EffectFact]
    frontiers: list[EffectFrontier]
    resultHandling: list[ResultHandling]
    coverage: Literal["complete-for-supported-scope", "partial", "not-analyzed"]
    counts: EffectCounts
    assumptions: list[str]


class FunctionEffectsResponse(BaseModel):
    """``POST /api/dataflow/function-effects``."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    effects: FunctionEffectsResult | None = None


# ---- anchor graph (contracts/anchorGraph.schema.json) ------------------------


class AnchorRef(BaseModel):
    file: str
    absPath: str
    span: SourceSpan
    text: str
    kind: str
    elementId: str | None
    typeText: str | None


class AnchorNode(BaseModel):
    id: str
    kind: Literal["anchor", "scope", "value", "transform", "control", "origin", "terminal", "boundary", "frontier"]
    label: str
    detail: str | None
    parent: str | None
    file: str
    absPath: str
    line: int
    span: SourceSpan
    status: EvidenceStatus
    side: Literal["seed", "up", "down", "both"]
    elementKind: str | None
    typeText: str | None
    reason: str | None
    note: str | None


# Mirrors anchorEdgeStatusSchema: a proof status, or "structural" for a link the
# projection found by syntax (a declaration's own parameter or return).
AnchorEdgeStatus = EvidenceStatus | Literal["structural"]


class AnchorEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: str
    status: AnchorEdgeStatus
    proof: list[EvidenceProof]
    label: str | None


class AnchorOrigin(BaseModel):
    nodeId: str
    label: str
    roles: list[str]
    status: EvidenceStatus


class AnchorTerminal(BaseModel):
    nodeId: str
    label: str
    roles: list[str]
    status: EvidenceStatus


class AnchorCounts(BaseModel):
    up: int
    down: int
    scopes: int
    origins: int
    terminals: int
    boundaries: int
    frontiers: int


class AnchorGraphResult(BaseModel):
    outcome: Outcome
    generation: int
    programHash: str
    tsconfig: str
    typescript: str
    reason: str | None
    anchor: AnchorRef
    direction: Literal["forward", "backward", "both"]
    nodes: list[AnchorNode]
    edges: list[AnchorEdge]
    origins: list[AnchorOrigin]
    terminals: list[AnchorTerminal]
    counts: AnchorCounts
    coverage: LedgerCoverage


class AnchorGraphResponse(BaseModel):
    """``POST /api/dataflow/anchor-graph``: the graph, or an outcome without one."""

    outcome: Outcome
    reason: str | None = None
    message: str | None = None
    generation: int | None = None
    programHash: str | None = None
    graph: AnchorGraphResult | None = None
