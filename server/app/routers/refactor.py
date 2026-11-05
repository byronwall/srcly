from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.refactor import compiler, runs
from app.services.refactor.plan import RefactorError, parse, safe_path

router = APIRouter(prefix="/api/refactor", tags=["refactor"])


@router.get("/catalog")
def catalog():
    return {
        "dslVersion": 1,
        "workflow": ["catalog", "project", "parse", "preview", "codemod", "execute"],
        "operations": [{"name": "move-file", "syntax": 'move-file <path|$handle> -> "destination.ts"',
                        "preconditions": ["clean source commit", "one leaf tsconfig", "unused destination", "unchanged file extension", "no computed imports or location-sensitive source"],
                        "updates": ["source location", "imports", "re-exports", "file handles"],
                        "validation": "TypeScript diagnostics before and after each step"}],
        "example": 'refactor 1\nproject "tsconfig.json"\nlet state = file "src/state.ts"\nmove-file $state -> "src/model/state.ts"\n',
        "execution": "Preview first; execute its registered codemod in the returned isolated worktree. Unknown operations and failed preconditions block execution.",
    }


class PlanRequest(BaseModel):
    path: str
    source: str = Field(max_length=100_000)


class ExecuteRequest(BaseModel):
    mode: Literal["next", "all", "undo"] = "next"


def _call(action):
    try:
        return action()
    except RefactorError as exc:
        raise HTTPException(status_code=409, detail=exc.diagnostic) from exc
    except (ValueError, OSError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail={"code": "execution-error", "message": str(exc), "line": None}) from exc


@router.get("/project")
def project(path: str, config: str = "tsconfig.json"):
    return _call(lambda: compiler.inspect(Path(path).resolve(), safe_path(config)))


@router.post("/parse")
def parse_plan(request: PlanRequest):
    return _call(lambda: parse(request.source))


@router.post("/preview")
def preview(request: PlanRequest):
    return _call(lambda: runs.preview(Path(request.path), request.source))


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    with runs._lock:
        return _call(lambda: runs.public(runs.load(run_id)))


@router.post("/runs/{run_id}/execute")
def execute(run_id: str, request: ExecuteRequest):
    return _call(lambda: runs.execute(run_id, request.mode))


@router.get("/runs/{run_id}/codemod")
def codemod(run_id: str):
    with runs._lock:
        def artifact():
            run = runs.load(run_id)
            return {"format": "srcly-codemod-1", "base": run["commit"], "source": run["source"],
                    "status": run["status"], "steps": run["steps"],
                    "execute": {"method": "POST", "path": f"/api/refactor/runs/{run_id}/execute", "body": {"mode": "all"}}}
        return _call(artifact)
