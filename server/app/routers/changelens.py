"""
Change Lens: the code chunks a window of git history edited.

    GET /api/change-lens        the window's commits, chunks and files (ChangeLensPayload)
    GET /api/change-lens/hunk   the diff text behind one chunk (LensHunkDiff)

The payload types are in client/src/changelens/types.ts.
"""

from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.changelens import service
from app.services.changelens.window import LensError, Params

router = APIRouter(prefix="/api/change-lens", tags=["change-lens"])


def _params(
    window: Literal["branch", "24h", "7d", "custom"] = "branch",
    mode: Literal["touched", "net"] = "touched",
    ref: str = "HEAD",
    base: Optional[str] = None,
    head: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    worktree: Optional[bool] = None,
    history: Optional[Literal["head", "main"]] = None,
) -> Params:
    return Params(window, mode, ref, base or None, head or None, since or None, until or None, worktree, history)


def _folder(path: str) -> Path:
    folder = Path(path).expanduser()
    if not folder.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    return folder


# Plain `def` handlers: FastAPI runs them in its thread pool, so git and the analyzers never block the event loop.
@router.get("")
def get_change_lens(
    path: str = Query(..., description="Absolute path of the analyzed folder"),
    window: Literal["branch", "24h", "7d", "custom"] = "branch",
    mode: Literal["touched", "net"] = "touched",
    ref: str = "HEAD",
    base: Optional[str] = None,
    head: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    worktree: Optional[bool] = None,
    history: Optional[Literal["head", "main"]] = None,
):
    try:
        return service.build_payload(_folder(path), _params(window, mode, ref, base, head, since, until, worktree, history))
    except LensError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get("/hunk")
def get_change_lens_hunk(
    path: str = Query(..., description="Absolute path of the analyzed folder"),
    chunk: str = Query(..., description="A chunk id from the payload"),
    commit: Optional[str] = Query(None, description="A commit sha or WORKTREE; omit for base to head"),
    window: Literal["branch", "24h", "7d", "custom"] = "branch",
    mode: Literal["touched", "net"] = "touched",
    ref: str = "HEAD",
    base: Optional[str] = None,
    head: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    worktree: Optional[bool] = None,
    history: Optional[Literal["head", "main"]] = None,
):
    try:
        return service.hunk_diff(
            _folder(path), _params(window, mode, ref, base, head, since, until, worktree, history), chunk, commit or None
        )
    except LensError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
