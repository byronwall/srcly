from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.refactor import compiler, runs
from app.services.refactor.catalog import catalog as operation_catalog
from app.services.refactor.plan import RefactorError, parse, safe_path

router = APIRouter(prefix="/api/refactor", tags=["refactor"])


@router.get("/catalog")
def catalog():
    return operation_catalog()


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
    def result():
        with runs.locked(run_id):
            return runs.public(runs.load(run_id))
    return _call(result)


@router.post("/runs/{run_id}/execute")
def execute(run_id: str, request: ExecuteRequest):
    return _call(lambda: runs.execute(run_id, request.mode))


@router.get("/runs/{run_id}/codemod")
def codemod(run_id: str):
    def artifact():
        with runs.locked(run_id):
            return runs.codemod(runs.load(run_id))
    return _call(artifact)
