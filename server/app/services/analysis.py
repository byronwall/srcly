import os
import lizard
import concurrent.futures
from pathlib import Path
from app.models import Node, Metrics
from app.config import IGNORE_DIRS, IGNORE_FILES, IGNORE_EXTENSIONS
from app.services.tree_sitter_analysis import TreeSitterAnalyzer

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
    node.metrics.file_count = 1
    
    # Set start/end line for the file (approximate, 1 to total lines)
    # We don't strictly have this from lizard always, but we can infer or leave 0.
    # For now, let's leave file start/end as 0 unless we want to read the file.
    
    # Calculate sum of function LOCs
    func_sum_loc = 0
    
    def convert_function(func, parent_path: str) -> Node:
        func_node = create_node(func.name, "function", f"{parent_path}::{func.name}")
        func_node.metrics.loc = func.nloc
        func_node.metrics.complexity = func.cyclomatic_complexity
        
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
        
        # Aggregate last_modified (max of children) and gitignored_count (sum of children)
        node.metrics.last_modified = max((child.metrics.last_modified for child in node.children), default=0.0)
        node.metrics.gitignored_count = sum(child.metrics.gitignored_count for child in node.children)
        node.metrics.file_size = sum(child.metrics.file_size for child in node.children)
        node.metrics.file_count = sum(child.metrics.file_count for child in node.children)
    
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
                # We want to count this as a gitignored file for the parent folder
                # But we don't have the node structure yet. 
                # We'll need to store this count and attach it later or build a map.
                # Simpler approach: return a list of ignored files and process them.
                # For now, let's just count them in a map keyed by parent dir.
                continue
            files_to_scan.append(str(file_path))

    # Second pass to count gitignored files per directory to attach to nodes later
    # This is a bit inefficient to walk again or we could have done it above.
    # Let's just do a quick walk or modify the above loop to store ignored counts.
    ignored_counts = {} # path_str -> count
    
    for root_dir, dirs, files in os.walk(root_path):
        # We need to respect the same directory traversal logic to find ignored files in valid dirs
        # But we already filtered dirs in the previous loop? No, os.walk yields.
        # Let's just rely on the fact that we can check files again or refactor the loop above.
        # Refactoring the loop above is better.
        pass 
    
    # REFACTORING THE LOOP ABOVE TO COUNT IGNORED FILES
    files_to_scan = []
    ignored_counts = {} # dir_path_str -> count

    for root_dir, dirs, files in os.walk(root_path):
        # Apply ignore dirs from config and .gitignore
        # We must modify dirs in-place to prune traversal
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not any(Path(root_dir, d).match(p) for p in gitignore_patterns)]
        
        current_ignored_count = 0
        for file in files:
            if file in IGNORE_FILES: continue
            if Path(file).suffix in IGNORE_EXTENSIONS: continue
            
            file_path = Path(root_dir) / file
            rel_path = file_path.relative_to(root_path)
            
            if any(rel_path.match(p) for p in gitignore_patterns):
                current_ignored_count += 1
                continue
                
            files_to_scan.append(str(file_path))
        
        if current_ignored_count > 0:
            ignored_counts[str(root_dir)] = current_ignored_count

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
