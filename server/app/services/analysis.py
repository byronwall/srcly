import os
import lizard
import concurrent.futures
from pathlib import Path

from app.models import Node, Metrics
from app.config import IGNORE_DIRS, IGNORE_FILES, IGNORE_EXTENSIONS
from app.services.tree_sitter_analysis import TreeSitterAnalyzer
from pathspec import PathSpec

_ts_analyzer = None

def get_ts_analyzer():
    global _ts_analyzer
    if _ts_analyzer is None:
        _ts_analyzer = TreeSitterAnalyzer()
    return _ts_analyzer

def find_repo_root(start_path: Path) -> Path:
    current = start_path.resolve()
    for parent in [current, *current.parents]:
        if (parent / ".git").exists(): return parent
    return current

def create_node(name: str, node_type: str, path: str) -> Node:
    return Node(
        name=name,
        type=node_type,
        path=path,
        metrics=Metrics(),
        children=[]
    )

def attach_file_metrics(node: Node, file_info) -> None:
    total_loc = file_info.nloc
    node.metrics.loc = total_loc
    node.metrics.complexity = file_info.average_cyclomatic_complexity
    node.metrics.function_count = len(file_info.function_list)
    node.metrics.function_count = len(file_info.function_list)
    node.metrics.file_count = 1
    # TS/TSX-specific metrics are only available for TypeScript/TSX files analyzed
    # by the TreeSitterAnalyzer. Plain lizard FileInformation objects (e.g. for
    # Python or other languages) won't have these attributes, so guard them.
    if hasattr(file_info, "tsx_nesting_depth"):
        node.metrics.tsx_nesting_depth = file_info.tsx_nesting_depth
        node.metrics.tsx_render_branching_count = file_info.tsx_render_branching_count
        node.metrics.tsx_react_use_effect_count = file_info.tsx_react_use_effect_count
        node.metrics.tsx_anonymous_handler_count = file_info.tsx_anonymous_handler_count
        node.metrics.tsx_prop_count = file_info.tsx_prop_count
        node.metrics.ts_any_usage_count = file_info.ts_any_usage_count
        node.metrics.ts_ignore_count = file_info.ts_ignore_count
        node.metrics.ts_import_coupling_count = file_info.ts_import_coupling_count
        node.metrics.tsx_hardcoded_string_volume = file_info.tsx_hardcoded_string_volume
        node.metrics.tsx_duplicated_string_count = file_info.tsx_duplicated_string_count
    
    # New metrics
    if hasattr(file_info, 'comment_lines'):
        node.metrics.comment_lines = file_info.comment_lines
        node.metrics.comment_density = file_info.comment_density
        node.metrics.max_nesting_depth = file_info.max_nesting_depth
        node.metrics.average_function_length = file_info.average_function_length
        node.metrics.parameter_count = file_info.parameter_count
        node.metrics.todo_count = file_info.todo_count
        node.metrics.classes_count = file_info.classes_count
    
    # Set start/end line for the file (approximate, 1 to total lines)
    # We don't strictly have this from lizard always, but we can infer or leave 0.
    # For now, let's leave file start/end as 0 unless we want to read the file.
    
    # Calculate sum of function LOCs
    func_sum_loc = 0
    
    def convert_function(func, parent_path: str) -> Node:
        func_node = create_node(func.name, "function", f"{parent_path}::{func.name}")
        func_node.metrics.loc = func.nloc
        func_node.metrics.loc = func.nloc
        func_node.metrics.complexity = func.cyclomatic_complexity
        
        # Safely get new metrics (Lizard functions won't have these)
        func_node.metrics.parameter_count = getattr(func, 'parameter_count', 0)
        func_node.metrics.max_nesting_depth = getattr(func, 'max_nesting_depth', 0)
        func_node.metrics.comment_lines = getattr(func, 'comment_lines', 0)
        func_node.metrics.todo_count = getattr(func, 'todo_count', 0)
        
        # Density for function
        comment_lines = getattr(func, 'comment_lines', 0)
        func_node.metrics.comment_density = comment_lines / func.nloc if func.nloc > 0 else 0.0
        
        if hasattr(func, 'start_line'):
            func_node.start_line = func.start_line
        if hasattr(func, 'end_line'):
            func_node.end_line = func.end_line
            
        # Process children if they exist (for TS/TSX)
        if hasattr(func, 'children') and func.children:
            for child in func.children:
                child_node = convert_function(child, func_node.path)
                func_node.children.append(child_node)
        
        return func_node

    for func in file_info.function_list:
        func_node = convert_function(func, node.path)
        node.children.append(func_node)
        func_sum_loc += func.nloc

    # CRITICAL FIX: Add a virtual node for the "Glue Code" (Imports, Exports, Global Vars)
    remainder = total_loc - func_sum_loc
    if remainder > 0:
        misc_node = create_node("(misc/imports)", "code_fragment", f"{node.path}::__misc__")
        misc_node.metrics.loc = remainder
        misc_node.metrics.complexity = 0 # Glue code is usually simple
        node.children.append(misc_node)


def _translate_gitignore_pattern(raw_line: str, base_rel: str) -> str | None:
    """
    Translate a single .gitignore pattern that lives in a directory `base_rel`
    (relative to the repo root) into a repo-root-relative gitwildmatch pattern.

    This approximates Git's semantics including:
    - patterns starting with '!' (negation)
    - patterns starting with '/' (anchored to the .gitignore directory)
    - patterns without '/' applying within the directory subtree
    """
    line = raw_line.rstrip("\n")
    if not line or line.lstrip().startswith("#"):
        return None

    negated = line.startswith("!")
    body = line[1:] if negated else line

    # Strip leading slash: anchored to the directory containing the .gitignore
    if body.startswith("/"):
        body = body[1:]

    # Compute prefix for this .gitignore directory
    prefix = f"{base_rel}/" if base_rel else ""

    # If the pattern contains a slash, it's relative to the directory root.
    # Otherwise, it should match that name anywhere under the directory.
    if "/" in body:
        pat = prefix + body
    else:
        if base_rel:
            pat = f"{base_rel}/**/{body}"
        else:
            pat = f"**/{body}"

    return f"!{pat}" if negated else pat


def _load_gitignore_spec(root_path: Path) -> tuple[Path, PathSpec | None]:
    """
    Load a PathSpec representing .gitignore rules visible from the given
    root path, honoring nested .gitignore files similarly to Git.

    We treat the *repository root* (where .git lives) as the base for all
    ignore patterns, so that scanning a subdirectory still respects repo-level
    .gitignore files and nested ones.
    """
    repo_root = find_repo_root(root_path)

    all_patterns: list[str] = []

    for dirpath, dirnames, filenames in os.walk(repo_root):
        # Never look inside the .git directory for ignore rules
        if ".git" in dirnames:
            dirnames.remove(".git")

        if ".gitignore" not in filenames:
            continue

        gitignore_file = Path(dirpath) / ".gitignore"
        base_rel = (
            str(Path(dirpath).relative_to(repo_root).as_posix())
            if Path(dirpath) != repo_root
            else ""
        )

        with open(gitignore_file, "r") as f:
            for raw in f:
                translated = _translate_gitignore_pattern(raw, base_rel)
                if translated is not None:
                    all_patterns.append(translated)

    if not all_patterns:
        return repo_root, None

    spec = PathSpec.from_lines("gitwildmatch", all_patterns)
    return repo_root, spec


def _is_gitignored(path: Path, ignore_root: Path, spec: PathSpec | None) -> bool:
    """
    Return True if the given path should be ignored according to the
    provided PathSpec and root_path.
    """
    if spec is None:
        return False

    try:
        rel = path.relative_to(ignore_root)
    except ValueError:
        rel = path

    rel_str = rel.as_posix()
    return spec.match_file(rel_str)

def aggregate_metrics(node: Node) -> Metrics:
    if not node.children: return node.metrics

    total_loc = 0
    max_complexity = 0
    total_funcs = 0
    
    # New metrics aggregation
    total_comment_lines = 0
    max_nesting_depth = 0
    total_parameter_count = 0
    total_todo_count = 0
    total_classes_count = 0
    
    # For average function length, we need total function loc and total functions (already have total_funcs)
    # But we need to sum function locs from children.
    # Let's track total function loc separately if we want to be precise, 
    # OR we can just use the child's average * child's function count.
    total_function_loc = 0

    for child in node.children:
        child_metrics = aggregate_metrics(child)
        total_loc += child_metrics.loc
        max_complexity = max(max_complexity, child_metrics.complexity)
        total_funcs += child_metrics.function_count
        
        total_comment_lines += child_metrics.comment_lines
        max_nesting_depth = max(max_nesting_depth, child_metrics.max_nesting_depth)
        total_parameter_count += child_metrics.parameter_count
        total_todo_count += child_metrics.todo_count
        total_classes_count += child_metrics.classes_count
        
        # Reconstruct total function loc from average * count
        total_function_loc += (child_metrics.average_function_length * child_metrics.function_count)

    # For Folders: Sum of children
    # For Files: We trust the attach_file_metrics logic (which includes __misc__)
    if node.type == "folder":
        node.metrics.loc = total_loc
        node.metrics.complexity = max_complexity
        node.metrics.function_count = total_funcs
        
        # Aggregate last_modified (max of children) and gitignored_count (sum of children)
        node.metrics.last_modified = max((child.metrics.last_modified for child in node.children), default=0.0)
        node.metrics.gitignored_count = sum(child.metrics.gitignored_count for child in node.children)
        node.metrics.file_size = sum(child.metrics.file_size for child in node.children)
        node.metrics.file_count = sum(child.metrics.file_count for child in node.children)
        
        node.metrics.comment_lines = total_comment_lines
        node.metrics.comment_density = total_comment_lines / total_loc if total_loc > 0 else 0.0
        node.metrics.max_nesting_depth = max_nesting_depth
        node.metrics.parameter_count = total_parameter_count
        node.metrics.todo_count = total_todo_count
        node.metrics.classes_count = total_classes_count
        node.metrics.average_function_length = total_function_loc / total_funcs if total_funcs > 0 else 0.0
    
    return node.metrics

def analyze_single_file(file_path: str):
    """
    Wrapper to analyze a single file safely.
    Must be top-level for multiprocessing pickling.
    """
    try:
        if file_path.endswith('.ts') or file_path.endswith('.tsx'):
            analyzer = get_ts_analyzer()
            return analyzer.analyze_file(file_path)
        else:
            return lizard.analyze_file(file_path)
    except Exception as e:
        # Return error info instead of crashing
        return {"error": str(e), "filename": file_path}

def scan_codebase(root_path: Path) -> Node:
    print(f"🔍 Scanning: {root_path}", flush=True)

    # Load .gitignore spec (repo-wide, with nested .gitignore support)
    ignore_root, gitignore_spec = _load_gitignore_spec(root_path)

    files_to_scan: list[str] = []
    ignored_counts: dict[str, int] = {}

    for root_dir, dirs, files in os.walk(root_path):
        root_dir_path = Path(root_dir)

        # Apply ignore dirs from config and .gitignore
        # We must modify dirs in-place to prune traversal
        pruned_dirs: list[str] = []
        for d in dirs:
            if d in IGNORE_DIRS:
                continue
            dir_path = root_dir_path / d
            if _is_gitignored(dir_path, ignore_root, gitignore_spec):
                # Entire directory is ignored; we skip traversing into it.
                continue
            pruned_dirs.append(d)
        dirs[:] = pruned_dirs

        current_ignored_count = 0
        for file in files:
            if file in IGNORE_FILES:
                continue
            if Path(file).suffix in IGNORE_EXTENSIONS:
                continue

            file_path = root_dir_path / file

            if _is_gitignored(file_path, ignore_root, gitignore_spec):
                current_ignored_count += 1
                continue

            files_to_scan.append(str(file_path))

        if current_ignored_count > 0:
            ignored_counts[str(root_dir_path)] = current_ignored_count

    print(f"📂 Analyzing {len(files_to_scan)} source files...", flush=True)
    
    analysis_results = []
    
    # Use ProcessPoolExecutor for better control and per-file error handling
    # lizard.analyze_files was opaque and crashing the whole pool on one error
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        future_to_file = {executor.submit(analyze_single_file, f): f for f in files_to_scan}
        
        completed_count = 0
        total_count = len(files_to_scan)
        
        for future in concurrent.futures.as_completed(future_to_file):
            file = future_to_file[future]
            completed_count += 1
            try:
                # Add a timeout to prevent hanging on single files
                result = future.result(timeout=5)
                if isinstance(result, dict) and "error" in result:
                    print(f"❌ [{completed_count}/{total_count}] Error analyzing {file}: {result['error']}", flush=True)
                else:
                    # Success
                    print(f"✅ [{completed_count}/{total_count}] Analyzed {file}", flush=True)
                    analysis_results.append(result)
            except concurrent.futures.TimeoutError:
                print(f"❌ [{completed_count}/{total_count}] Timeout analyzing {file} (skipped)", flush=True)
            except Exception as exc:
                print(f"❌ [{completed_count}/{total_count}] Exception analyzing {file}: {exc}", flush=True)

    tree_root = create_node("root", "folder", str(root_path))
    node_map = {str(root_path): tree_root}

    for file_info in analysis_results:
        path_obj = Path(file_info.filename)
        try: rel_path = path_obj.relative_to(root_path)
        except ValueError: continue

        parts = rel_path.parts
        current_node = tree_root
        current_path = root_path

        # Build Folder Tree
        for part in parts[:-1]:
            next_path = current_path / part
            next_path_str = str(next_path)
            if next_path_str not in node_map:
                new_folder = create_node(part, "folder", next_path_str)
                # Set gitignored count if we have it for this folder
                if next_path_str in ignored_counts:
                    new_folder.metrics.gitignored_count = ignored_counts[next_path_str]
                current_node.children.append(new_folder)
                node_map[next_path_str] = new_folder
            current_node = node_map[next_path_str]
            current_path = next_path

        # Add File
        file_node = create_node(parts[-1], "file", str(path_obj))
        file_node = create_node(parts[-1], "file", str(path_obj))
        attach_file_metrics(file_node, file_info)
        # Set last_modified
        try:
            stat = os.stat(path_obj)
            file_node.metrics.last_modified = stat.st_mtime
            file_node.metrics.file_size = stat.st_size
        except OSError:
            file_node.metrics.last_modified = 0.0
            file_node.metrics.file_size = 0
            
        current_node.children.append(file_node)

    aggregate_metrics(tree_root)
    return tree_root
