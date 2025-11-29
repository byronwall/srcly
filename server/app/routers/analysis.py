from fastapi import APIRouter, HTTPException
from pathlib import Path
import json
import os
from typing import Dict, List, Optional, Tuple

from app.models import Node, DependencyGraph, DependencyNode, DependencyEdge
from app.services import analysis, cache, tree_sitter_analysis
from app.config import IGNORE_DIRS

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# TODO: Make this configurable via env var or request
ROOT_PATH = Path.cwd()

TSCONFIG_CANDIDATE_NAMES: Tuple[str, ...] = (
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.base.json",
)


def _find_candidate_tsconfig_files(start: Path) -> List[Path]:
    """
    Walk up from the given path and collect any nearby tsconfig-style files.

    We keep this deliberately simple for now:
    - Look for a small set of common tsconfig filenames.
    - Stop at the filesystem root.
    - Return candidates ordered from nearest directory upwards.
    """
    current = start if start.is_dir() else start.parent
    seen: set[Path] = set()
    candidates: List[Path] = []

    for parent in [current, *current.parents]:
        for name in TSCONFIG_CANDIDATE_NAMES:
            candidate = parent / name
            if candidate.exists() and candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)

    return candidates


def _load_tsconfig_paths(tsconfig_path: Path) -> Tuple[Path, Dict[str, List[str]]]:
    """
    Load `compilerOptions.baseUrl` and `compilerOptions.paths` from a tsconfig.

    Returns a tuple of:
    - base_dir: the directory from which path mappings should be resolved
    - paths: the raw `paths` mapping (alias -> list of patterns)

    If anything goes wrong, we fall back to treating the tsconfig's parent
    directory as the base and an empty paths mapping.
    """
    try:
        with tsconfig_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return tsconfig_path.parent, {}

    compiler = data.get("compilerOptions") or {}
    base_url = compiler.get("baseUrl")

    if isinstance(base_url, str) and base_url.strip():
        base_dir = (tsconfig_path.parent / base_url).resolve()
    else:
        base_dir = tsconfig_path.parent.resolve()

    raw_paths = compiler.get("paths") or {}
    paths: Dict[str, List[str]] = {}

    if isinstance(raw_paths, dict):
        for key, value in raw_paths.items():
            if isinstance(key, str):
                # Normalise to list[str]
                if isinstance(value, list):
                    paths[key] = [v for v in value if isinstance(v, str)]
                elif isinstance(value, str):
                    paths[key] = [value]

    return base_dir, paths


def _apply_tsconfig_paths(
    import_path: str,
    base_dir: Path,
    paths: Dict[str, List[str]],
) -> List[Path]:
    """
    Apply TypeScript path aliases to an import path to get candidate filesystem paths.

    We handle the most common/simple cases:
    - Exact alias:  \"@core\": [\"src/core/index.ts\"]
    - Single trailing wildcard: \"@utils/*\": [\"src/utils/*\"]

    More complex patterns (multiple '*' or wildcards in the middle) are ignored
    for now to keep behaviour predictable.
    """
    if not paths:
        return []

    candidates: List[Path] = []

    for pattern, target_patterns in paths.items():
        if "*" in pattern:
            # Only support a single trailing '*' pattern like '@alias/*'
            star_index = pattern.find("*")
            prefix = pattern[:star_index]
            suffix = pattern[star_index + 1 :]

            if not import_path.startswith(prefix) or not import_path.endswith(suffix):
                continue

            wildcard_value = import_path[len(prefix) : len(import_path) - len(suffix)]

            for target_pattern in target_patterns:
                if "*" not in target_pattern:
                    # Simple case: just append the wildcard value if present.
                    target = target_pattern
                    if wildcard_value:
                        # Avoid duplicate slashes
                        if not target.endswith("/") and not wildcard_value.startswith("/"):
                            target = f"{target}/{wildcard_value}"
                        else:
                            target = f"{target}{wildcard_value}"
                else:
                    # Replace the first '*' with the wildcard value.
                    target_star_index = target_pattern.find("*")
                    target_prefix = target_pattern[:target_star_index]
                    target_suffix = target_pattern[target_star_index + 1 :]
                    target = f"{target_prefix}{wildcard_value}{target_suffix}"

                candidates.append((base_dir / target).resolve())
        else:
            # Exact match alias, e.g. '@core': ['src/core/index.ts']
            if import_path != pattern:
                continue
            for target_pattern in target_patterns:
                candidates.append((base_dir / target_pattern).resolve())

    return candidates


def _resolve_internal_file(spec_path: Path, file_to_id: Dict[Path, str]) -> Optional[Path]:
    """
    Given a spec_path that may or may not include an extension, try to resolve it
    to one of the known files in file_to_id using common TS/TSX conventions.
    """
    resolved = spec_path.resolve()
    if resolved in file_to_id:
        return resolved

    # If the path has an extension that is NOT a standard JS/TS extension,
    # we should not try to fuzzy-match it to a .ts/.tsx file.
    # e.g. import './index.css' should not resolve to index.tsx
    # We allow .js/.jsx because TS allows importing .js which resolves to .ts
    if resolved.suffix and resolved.suffix not in {".js", ".jsx", ".ts", ".tsx", ".d.ts"}:
        return None

    # Try common TypeScript/TSX extensions
    stem = resolved.with_suffix("")
    for ext in (".ts", ".tsx", ".d.ts"):
        candidate = stem.with_suffix(ext)
        if candidate in file_to_id:
            return candidate

    # Try index files in the target directory
    for index_name in ("index.ts", "index.tsx"):
        candidate = (resolved / index_name).resolve()
        if candidate in file_to_id:
            return candidate

    return None

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

    # 2. Find candidate tsconfig files and load the first one (nearest first).
    tsconfig_candidates = _find_candidate_tsconfig_files(target_path)
    ts_base_dir: Optional[Path] = None
    ts_paths: Dict[str, List[str]] = {}
    if tsconfig_candidates:
        ts_base_dir, ts_paths = _load_tsconfig_paths(tsconfig_candidates[0])

    # 3. Extract imports and create edges
    for file_path in files_to_process:
        file_path = file_path.resolve()
        source_id = file_to_id[file_path]
        try:
            imports, _ = analyzer.extract_imports_exports(str(file_path))

            for import_path in imports:
                target_file: Optional[Path] = None

                if import_path.startswith("."):
                    # Relative import
                    resolved = file_path.parent / import_path
                    target_file = _resolve_internal_file(resolved, file_to_id)
                else:
                    # Non-relative import: first try tsconfig path aliases (if available)
                    if ts_base_dir is not None and ts_paths:
                        alias_candidates = _apply_tsconfig_paths(
                            import_path,
                            ts_base_dir,
                            ts_paths,
                        )
                        for candidate in alias_candidates:
                            target_file = _resolve_internal_file(candidate, file_to_id)
                            if target_file is not None:
                                break

                if target_file is not None:
                    target_id = file_to_id[target_file]
                    edges.append(
                        DependencyEdge(
                            id=f"{source_id}-{target_id}",
                            source=source_id,
                            target=target_id,
                            label=None,
                        )
                    )
                else:
                    # External dependency or could not resolve.
                    # For now, add external nodes for non-relative imports.
                    if not import_path.startswith("."):
                        ext_id = f"ext:{import_path}"
                        # Check if we already added this external node
                        if ext_id not in id_to_file:
                            nodes.append(
                                DependencyNode(
                                    id=ext_id,
                                    label=import_path,
                                    type="external",
                                )
                            )
                            id_to_file[ext_id] = "external"

                        edges.append(
                            DependencyEdge(
                                id=f"{source_id}-{ext_id}",
                                source=source_id,
                                target=ext_id,
                                label=None,
                            )
                        )

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
