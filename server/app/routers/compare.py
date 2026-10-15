"""
Compare two git refs (PR compare mode).

    GET    /api/compare/refs          branches + recent commits for the picker
    GET    /api/compare/sources       one picker section: prs | worktrees | branches
    GET    /api/compare/commits       first-parent commits in base..head (commit stepper)
    POST   /api/compare/prewarm       scan one commit side in the background
    POST   /api/compare               start (or join) a compare   -> snapshot
    GET    /api/compare/{id}          current snapshot (poll)
    GET    /api/compare/{id}/result   compare payload once complete
    DELETE /api/compare/{id}          cancel                      -> snapshot
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.routers import analysis as analysis_router
from app.services.compare import jobs, sources
from app.services.compare.git_refs import (
    AUTO,
    GitError,
    default_branch,
    list_commits,
    repo_root,
    resolve_auto_base,
    resolve_ref,
    run_git,
)
from app.services.compare.service import DEFAULT_BASE, DEFAULT_HEAD

router = APIRouter(prefix="/api/compare", tags=["compare"])

RECENT_COMMITS = 30
RECENT_BRANCHES = 20


class StartCompareRequest(BaseModel):
    path: Optional[str] = None
    base: str = DEFAULT_BASE
    head: str = DEFAULT_HEAD
    force: bool = False


def _target(path: Optional[str]) -> Path:
    target = Path(path) if path else analysis_router.ROOT_PATH
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {target}")
    return target.resolve()


def _job_or_404(job_id: str) -> jobs.CompareJob:
    job = jobs.manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Compare not found")
    return job


@router.get("/refs")
def list_refs(path: Optional[str] = None) -> dict:
    try:
        repo = repo_root(_target(path))
        current = run_git(repo, "rev-parse", "--abbrev-ref", "HEAD").strip()
        branches = [
            dict(zip(("name", "sha", "date"), line.split("\0")))
            for line in run_git(
                repo,
                "for-each-ref",
                "--sort=-committerdate",
                f"--count={RECENT_BRANCHES}",
                "--format=%(refname:short)%00%(objectname:short)%00%(committerdate:relative)",
                "refs/heads",
            ).splitlines()
        ]
        commits = [
            dict(zip(("sha", "subject", "date"), line.split("\0")))
            for line in run_git(
                repo, "log", f"-{RECENT_COMMITS}", "--format=%h%x00%s%x00%cr"
            ).splitlines()
        ]
        try:
            default = default_branch(repo)
        except GitError:
            default = None
    except GitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "repo": str(repo),
        "current": current,
        "defaultBranch": default,
        "branches": branches,
        "commits": commits,
    }


@router.get("/sources")
def list_sources(kind: str, path: Optional[str] = None, all: bool = False, refresh: bool = False) -> dict:
    """
    One picker section. Each kind is its own request so worktrees and branches
    render while ``gh`` is still answering. A source that can't load (no gh,
    not signed in, offline) comes back with ``available: false`` and a reason.
    """
    if kind not in ("prs", "worktrees", "branches"):
        raise HTTPException(status_code=400, detail=f"Unknown source kind: {kind}")
    try:
        repo = repo_root(_target(path))
    except GitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"repo": str(repo), **sources.load_source(repo, kind, mine=not all, refresh=refresh)}


@router.get("/commits")
def get_commits(base: str, head: str, path: Optional[str] = None) -> dict:
    """The commits a stepper walks: ``base`` resolves as a base (``pr:<n>`` → its merge-base, ``auto``)."""
    try:
        repo = repo_root(_target(path))
        head_ref = resolve_ref(repo, head, side="head")
        base_ref = resolve_auto_base(repo, head, head_ref) if base == AUTO else resolve_ref(repo, base, side="base")
        listing = list_commits(repo, base_ref, head_ref)
    except GitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "base": {"sha": base_ref.sha, "label": base_ref.label, "subject": base_ref.subject},
        "head": {"sha": head_ref.sha, "label": head_ref.label},
        **listing,
    }


class PrewarmRequest(BaseModel):
    path: Optional[str] = None
    ref: str


@router.post("/prewarm", status_code=202)
def prewarm(req: PrewarmRequest) -> dict:
    try:
        state = jobs.manager.prewarm(_target(req.path), req.ref.strip())
    except GitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ref": req.ref, "state": state}


@router.post("", status_code=202)
def start_compare(req: StartCompareRequest) -> dict:
    target = _target(req.path)
    return jobs.manager.start(target, req.base.strip(), req.head.strip(), force=req.force).snapshot()


@router.get("/{job_id}")
def get_compare(job_id: str) -> dict:
    return _job_or_404(job_id).snapshot()


@router.delete("/{job_id}")
def cancel_compare(job_id: str) -> dict:
    job = _job_or_404(job_id)
    job.cancel_token.cancel()
    return job.snapshot()


@router.get("/{job_id}/result")
def get_compare_result(job_id: str):
    job = _job_or_404(job_id)
    if job.phase != "complete" or job.result_json is None:
        raise HTTPException(status_code=409, detail=f"Compare is {job.phase}, not complete")
    return Response(content=job.result_json, media_type="application/json")
