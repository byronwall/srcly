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
