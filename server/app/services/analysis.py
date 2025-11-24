import os
import lizard
import concurrent.futures
from pathlib import Path
from app.models import Node, Metrics
from app.config import IGNORE_DIRS, IGNORE_FILES, IGNORE_EXTENSIONS

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

    # Calculate sum of function LOCs
    func_sum_loc = 0
    
    for func in file_info.function_list:
        func_node = create_node(func.name, "function", f"{node.path}::{func.name}")
        func_node.metrics.loc = func.nloc
        func_node.metrics.complexity = func.cyclomatic_complexity
        # Functions don't have children in this model
        node.children.append(func_node)
        func_sum_loc += func.nloc

    # CRITICAL FIX: Add a virtual node for the "Glue Code" (Imports, Exports, Global Vars)
    remainder = total_loc - func_sum_loc
    if remainder > 0:
        misc_node = create_node("(misc/imports)", "code_fragment", f"{node.path}::__misc__")
        misc_node.metrics.loc = remainder
        misc_node.metrics.complexity = 0 # Glue code is usually simple
        node.children.append(misc_node)

def aggregate_metrics(node: Node) -> Metrics:
    if not node.children: return node.metrics

    total_loc = 0
    max_complexity = 0
    total_funcs = 0

    for child in node.children:
        child_metrics = aggregate_metrics(child)
        total_loc += child_metrics.loc
        max_complexity = max(max_complexity, child_metrics.complexity)
        total_funcs += child_metrics.function_count

    # For Folders: Sum of children
    # For Files: We trust the attach_file_metrics logic (which includes __misc__)
    if node.type == "folder":
        node.metrics.loc = total_loc
        node.metrics.complexity = max_complexity
        node.metrics.function_count = total_funcs
    
    return node.metrics

def analyze_single_file(file_path: str):
    """
    Wrapper to analyze a single file safely.
    Must be top-level for multiprocessing pickling.
    """
    try:
        # We can't easily print from here to the main stdout without buffering issues in some envs,
        # but returning the result allows the main process to log.
        # However, for true parallelism, we might want to log here if we want to see it start.
        # But 'done' log is more important.
        return lizard.analyze_file(file_path)
    except Exception as e:
        # Return error info instead of crashing
        return {"error": str(e), "filename": file_path}

def scan_codebase(root_path: Path) -> Node:
    print(f"🔍 Scanning: {root_path}", flush=True)

    files_to_scan = []
    # Load .gitignore patterns if present
    gitignore_path = root_path / ".gitignore"
    gitignore_patterns = []
    if gitignore_path.is_file():
        with open(gitignore_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    gitignore_patterns.append(line)
    
    for root_dir, dirs, files in os.walk(root_path):
        # Apply ignore dirs from config and .gitignore (if pattern matches dir)
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not any(Path(root_dir, d).match(p) for p in gitignore_patterns)]
        for file in files:
            if file in IGNORE_FILES: continue
            if Path(file).suffix in IGNORE_EXTENSIONS: continue
            file_path = Path(root_dir) / file
            rel_path = file_path.relative_to(root_path)
            # Skip if matches any .gitignore pattern
            if any(rel_path.match(p) for p in gitignore_patterns):
                continue
            files_to_scan.append(str(file_path))

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
                current_node.children.append(new_folder)
                node_map[next_path_str] = new_folder
            current_node = node_map[next_path_str]
            current_path = next_path

        # Add File
        file_node = create_node(parts[-1], "file", str(path_obj))
        attach_file_metrics(file_node, file_info)
        current_node.children.append(file_node)

    aggregate_metrics(tree_root)
    return tree_root
