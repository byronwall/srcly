"""Change Lens payload models. They mirror ``client/src/changelens/types.ts`` field for field."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

WORKTREE = "WORKTREE"

LensWindow = Literal["branch", "24h", "7d", "custom"]
LensMode = Literal["touched", "net"]
LensHistory = Literal["head", "main"]
ChunkKind = Literal["function", "class", "heading", "file", "range"]
ChunkStatus = Literal["modified", "added", "deleted", "moved", "reverted"]
ChunkMatch = Literal["exact", "renamed-file", "moved", "uncertain", "none"]
ReviewBucket = Literal["complex-and-changed", "new-hotspot"]
FileStatus = Literal["added", "deleted", "modified", "renamed"]

# Optional in the TypeScript types (`field?:`): left out of the JSON when unset.
# Every other null is a real value ("no sha", "not measured") and stays.
_OMIT_WHEN_NONE = frozenset({"oldPath", "baseStartLine", "baseEndLine", "naReason"})


class LensModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def wire(self) -> dict:
        """The JSON shape the client reads."""
        return _strip(self.model_dump(by_alias=True))


def _strip(value):
    if isinstance(value, dict):
        return {k: _strip(v) for k, v in value.items() if not (v is None and k in _OMIT_WHEN_NONE)}
    if isinstance(value, list):
        return [_strip(v) for v in value]
    return value


class LensEndpoint(LensModel):
    ref: str
    sha: Optional[str]
    label: str
    date: Optional[str]


class LensBranch(LensModel):
    name: Optional[str]
    default: str
    default_ref: str
    on_default: bool
    ahead: int
    behind: int
    default_commits: Optional[int]


class LensSelection(LensModel):
    window: LensWindow
    mode: LensMode
    ref: str
    history: LensHistory
    branch: Optional[LensBranch]
    base: LensEndpoint
    head: LensEndpoint
    since: Optional[str]
    until: Optional[str]
    timezone: str
    includes_worktree: bool
    notes: list[str]
    repo_root: str
    scope: str


class LensCommit(LensModel):
    sha: str
    short: str
    subject: str
    author: str
    date: Optional[str]
    files: int
    added: int
    deleted: int
    chunk_ids: list[str]


class LensHunk(LensModel):
    sha: Optional[str]
    old_start: int
    old_lines: int
    new_start: int
    new_lines: int


class LensTouch(LensModel):
    sha: str
    added: int
    deleted: int


class BeforeAfter(LensModel):
    before: Optional[int | float]
    after: Optional[int | float]


class LensChunk(LensModel):
    id: str
    path: str
    old_path: Optional[str] = None
    kind: ChunkKind
    name: str
    start_line: int
    end_line: int
    base_start_line: Optional[int] = None
    base_end_line: Optional[int] = None
    status: ChunkStatus
    match: ChunkMatch
    added: int
    deleted: int
    net_added: int
    net_deleted: int
    touches: list[LensTouch]
    first_touched: Optional[str]
    last_touched: Optional[str]
    metrics: dict[str, BeforeAfter]
    measured: bool
    na_reason: Optional[str] = None
    buckets: list[ReviewBucket]
    file_class: str
    hunks: list[LensHunk]


class LensFile(LensModel):
    path: str
    old_path: Optional[str] = None
    status: FileStatus
    added: int
    deleted: int
    loc: Optional[int]
    file_class: str
    chunk_ids: list[str]
    out_of_scope: bool


class LensSummary(LensModel):
    files_edited: int
    files_total: int
    chunks: int
    churn_lines: int
    net_lines: int
    reverted: int


class ChangeLensPayload(LensModel):
    selection: LensSelection
    commits: list[LensCommit]
    chunks: list[LensChunk]
    files: list[LensFile]
    summary: LensSummary
    metric_ids: list[str]


class LensHunkDiff(LensModel):
    chunk_id: str
    path: str
    old_path: Optional[str] = None
    # `from` is a Python keyword.
    from_: str
    to: str
    diff: str
    truncated: bool

    model_config = ConfigDict(
        alias_generator=lambda name: "from" if name == "from_" else to_camel(name), populate_by_name=True
    )
