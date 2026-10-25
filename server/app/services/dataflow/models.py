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

from pydantic import BaseModel


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
    "stale-generation",
    "not-found",
    "unsupported-selection",
    "ambiguous-selection",
    "cancelled",
    "budget-exhausted",
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
    "engine-crashed",
    "timed-out",
    "engine-protocol-mismatch",
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


class RouteSummary(BaseModel):
    key: str
    pathPattern: str
    file: str
    absPath: str
    parameters: list[RouteParameter]


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
