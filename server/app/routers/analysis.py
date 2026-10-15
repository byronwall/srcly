from fastapi import APIRouter, HTTPException, Response
from pathlib import Path

from app.models import Node
from app.services import analysis, scan_jobs
from app.models import DepGraph
from app.services.deps.graph import build_dependency_graph

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# TODO: Make this configurable via env var or request
ROOT_PATH = Path.cwd()


def _scan_response(target_path: Path, force: bool = False) -> Response:
    """
    Scan ``target_path`` through the shared job manager and return the tree.

    An unchanged cached analysis is returned without scanning unless
    ``force`` is set.

    Joining the manager means concurrent requests for the same path (two tabs,
    a reload mid-scan, or a ``/api/scans`` job started by the UI) share one
    scan instead of each starting their own. The tree is returned as
    pre-encoded JSON so the encoding happens here, in a worker thread, rather
    than on the event loop.
    """
    job = scan_jobs.manager.start(target_path, force=force)
    job.wait()
    if job.phase == "cancelled":
        raise HTTPException(status_code=503, detail="Scan cancelled")
    if job.phase != "complete":
        raise HTTPException(status_code=500, detail=job.error or f"Scan {job.phase}")
    return Response(content=job.result_json(), media_type="application/json")


# Scan endpoints are plain `def` on purpose: FastAPI runs them in a worker
# thread, so a long scan never blocks the event loop (which would also stop
# uvicorn from reacting to Ctrl+C). They return a `Response` directly, so
# `response_model` only documents the shape.
@router.get("", response_model=Node)
def get_analysis(path: str = None):
    """
    Get the static analysis of the codebase.
    Returns the cached result if no files changed since it was taken,
    otherwise scans.
    """
    target_path = Path(path) if path else ROOT_PATH

    if not target_path.exists():
         # Fallback or error? Let's error if explicit path is invalid
         if path:
             raise HTTPException(status_code=404, detail="Path not found")
         target_path = ROOT_PATH

    return _scan_response(target_path)

@router.get("/dependency-graph", response_model=DepGraph, response_model_exclude_none=True)
def get_dependency_graph(path: str = None):
    """
    Hierarchical, language-neutral dependency graph (folders → files, importer → imported
    edges, barrels passed through). The client aggregates and lays it out.
    """
    target_path = Path(path) if path else ROOT_PATH
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if target_path.is_file():
        target_path = target_path.parent
    return build_dependency_graph(target_path)


@router.post("/refresh", response_model=Node)
def refresh_analysis(path: str = None):
    """
    Force a re-scan of the codebase, ignoring (and replacing) the cache.
    """
    target_path = Path(path) if path else ROOT_PATH
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    return _scan_response(target_path, force=True)


def _estimate_counts(root: Path) -> tuple[int, int]:
    """
    Return the (file_count, folder_count) a scan of ``root`` will analyze.

    Uses the scan's own discovery (git ls-files or the .gitignore walk, plus
    the built-in, binary, and minified filters) so the landing page matches
    the scan.
    """
    try:
        discovery = analysis.discover_files(root)
    except Exception:
        # If anything goes wrong, fall back to zeros but still report the path.
        return 0, 0
    return len(discovery.files), discovery.folder_count


@router.get("/context")
def get_analysis_context():
    """
    Return basic information about the current analysis root directory.

    This is used by the client to offer one-click analysis options on first
    load, for both the current working directory and the repository root.
    """
    current_root = ROOT_PATH
    # Use the same repository root detection logic as the analysis layer so that
    # the client sees a consistent "repo root" regardless of how the server was
    # started (uvx, direct CLI, dev mode, etc.).
    #
    # This mirrors the behaviour of the CLI helper that walks upwards from the
    # current directory to the enclosing `.git` root, falling back to the
    # starting directory when no repository is found.
    repo_root = analysis.find_repo_root(current_root)

    current_file_count, current_folder_count = _estimate_counts(current_root)

    repo_file_count = 0
    repo_folder_count = 0
    if repo_root.exists():
        repo_file_count, repo_folder_count = _estimate_counts(repo_root)

    return {
        "root_path": str(current_root),
        "file_count": current_file_count,
        "folder_count": current_folder_count,
        "repo_root_path": str(repo_root),
        "repo_file_count": repo_file_count,
        "repo_folder_count": repo_folder_count,
    }
