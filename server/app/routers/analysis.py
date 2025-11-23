from fastapi import APIRouter
from pathlib import Path
from app.models import Node
from app.services import analysis, cache

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# TODO: Make this configurable via env var or request
ROOT_PATH = Path.cwd()

@router.get("", response_model=Node)
async def get_analysis():
    """
    Get the static analysis of the codebase.
    Returns cached result if available, otherwise triggers a scan.
    """
    cached_tree = cache.load_analysis(ROOT_PATH)
    if cached_tree:
        return cached_tree
    
    # If no cache, run scan synchronously (for now, could be async/background)
    tree = analysis.scan_codebase(ROOT_PATH)
    cache.save_analysis(ROOT_PATH, tree)
    return tree

@router.post("/refresh", response_model=Node)
async def refresh_analysis():
    """
    Force a re-scan of the codebase.
    """
    tree = analysis.scan_codebase(ROOT_PATH)
    cache.save_analysis(ROOT_PATH, tree)
    return tree
