"""
Compare two git refs (PR compare mode).

    GET    /api/compare/refs          branches + recent commits for the picker
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
from app.services.compare import jobs
from app.services.compare.git_refs import GitError, default_branch, repo_root, run_git
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
