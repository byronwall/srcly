from fastapi import APIRouter, HTTPException
from pathlib import Path
import os

from app.models import Node, DependencyGraph, DependencyNode, DependencyEdge
from app.services import analysis, cache, tree_sitter_analysis
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

@router.get("/dependencies", response_model=DependencyGraph)
async def get_dependencies(path: str = None):
    """
    Build a dependency graph for the specified path.
    """
    target_path = Path(path) if path else ROOT_PATH
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    analyzer = tree_sitter_analysis.TreeSitterAnalyzer()
    nodes = []
    edges = []
    
    # Map file path to node ID
    file_to_id = {}
    # Map node ID to file path
    id_to_file = {}
    
    # 1. Scan files and create nodes
    # We only care about TS/TSX files for now
    files_to_process = []
    if target_path.is_file():
        if target_path.suffix in {'.ts', '.tsx'}:
            files_to_process.append(target_path)
    else:
        for root, dirs, files in os.walk(target_path):
            # Filter ignored dirs
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
            for file in files:
                if file.endswith(('.ts', '.tsx')):
                    files_to_process.append(Path(root) / file)

    for file_path in files_to_process:
        file_path = file_path.resolve()
        node_id = str(file_path) # Use absolute path as ID for simplicity

        # If the file is an index.* file or uses a dynamic route-style name
        # like [id].tsx, include its parent folder name to make the node
        # label more informative (e.g. "components/index.tsx" or
        # "posts/[id].tsx").
        file_name = file_path.name
        is_index = file_path.stem == "index"
        has_brackets = ("[" in file_name) and ("]" in file_name)

        if (is_index or has_brackets) and file_path.parent is not None:
            label = f"{file_path.parent.name}/{file_name}"
        else:
            label = file_name

        nodes.append(DependencyNode(id=node_id, label=label, type="file"))
        file_to_id[file_path] = node_id
        id_to_file[node_id] = file_path

    # 2. Extract imports and create edges
    for file_path in files_to_process:
        file_path = file_path.resolve()
        source_id = file_to_id[file_path]
        try:
            imports, _ = analyzer.extract_imports_exports(str(file_path))
            
            for import_path in imports:
                # Resolve import
                target_file = None
                
                if import_path.startswith("."):
                    # Relative import
                    resolved = (file_path.parent / import_path).resolve()
                    
                    # Try exact match first (unlikely for TS imports)
                    if resolved in file_to_id:
                        target_file = resolved
                    else:
                        # Try extensions
                        for ext in ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx']:
                            # Handle /index.ts case by appending
                            if ext.startswith('/'):
                                candidate = resolved / ext.lstrip('/')
                            else:
                                candidate = resolved.with_suffix(ext)
                            
                            if candidate in file_to_id:
                                target_file = candidate
                                break
                
                if target_file:
                    target_id = file_to_id[target_file]
                    edges.append(DependencyEdge(
                        id=f"{source_id}-{target_id}",
                        source=source_id,
                        target=target_id,
                        label=None
                    ))
                else:
                    # External dependency or could not resolve
                    # Create an external node if it doesn't exist?
                    # For now, let's just add external nodes for non-relative imports
                    # or unresolved relative imports.
                    
                    # To avoid clutter, maybe only add if it's a package import (not starting with .)
                    if not import_path.startswith("."):
                        ext_id = f"ext:{import_path}"
                        # Check if we already added this external node
                        if ext_id not in id_to_file:
                            nodes.append(DependencyNode(id=ext_id, label=import_path, type="external"))
                            id_to_file[ext_id] = "external"
                        
                        edges.append(DependencyEdge(
                            id=f"{source_id}-{ext_id}",
                            source=source_id,
                            target=ext_id,
                            label=None
                        ))

        except Exception as e:
            print(f"Error analyzing dependencies for {file_path}: {e}")
            continue

    return DependencyGraph(nodes=nodes, edges=edges)

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
