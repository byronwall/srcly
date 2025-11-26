from fastapi import APIRouter, HTTPException
from pathlib import Path
import os

from app.models import Node
from app.services import analysis, cache
from app.config import IGNORE_DIRS

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# TODO: Make this configurable via env var or request
ROOT_PATH = Path.cwd()

@router.get("", response_model=Node)
async def get_analysis(path: str = None):
    """
    Get the static analysis of the codebase.
    Returns cached result if available, otherwise triggers a scan.
    """
    target_path = Path(path) if path else ROOT_PATH
    
    if not target_path.exists():
         # Fallback or error? Let's error if explicit path is invalid
         if path:
             raise HTTPException(status_code=404, detail="Path not found")
         target_path = ROOT_PATH

    cached_tree = cache.load_analysis(target_path)
    if cached_tree:
        return cached_tree
    
    # If no cache, run scan synchronously (for now, could be async/background)
    tree = analysis.scan_codebase(target_path)
    cache.save_analysis(target_path, tree)
    return tree

@router.post("/refresh", response_model=Node)
async def refresh_analysis():
    """
    Force a re-scan of the codebase.
    """
    tree = analysis.scan_codebase(ROOT_PATH)
    cache.save_analysis(ROOT_PATH, tree)
    return tree


def _estimate_counts(root: Path) -> tuple[int, int]:
    """
    Return an estimated (file_count, folder_count) for a given root directory.

    This applies the same ignore rules used during a full analysis to keep the
    estimate reasonably fast while still informative.
    """
    file_count = 0
    folder_count = 0

    try:
        for _, dirnames, filenames in os.walk(root):
            # Apply ignore rules for directories to keep the estimate reasonable
            dirnames[:] = [
                d for d in dirnames
                if d not in IGNORE_DIRS and not d.startswith(".")
            ]
            folder_count += len(dirnames)
            file_count += len(filenames)
    except Exception:
        # If anything goes wrong, fall back to zeros but still report the path.
        file_count = 0
        folder_count = 0

    return file_count, folder_count


@router.get("/context")
async def get_analysis_context():
    """
    Return basic information about the current analysis root directory.

    This is used by the client to offer one-click analysis options on first
    load, for both the current working directory and the repository root.
    """
    current_root = ROOT_PATH
    repo_root = current_root.parent

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
