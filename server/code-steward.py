# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "lizard",
# ]
# ///

import os
import json
import lizard
from pathlib import Path
from typing import Dict, Any

# --- CONFIGURATION V3 ---
IGNORE_DIRS = {
    '.git', 'node_modules', 'venv', '__pycache__', 'dist', 'build', '.next', 
    'coverage', '.idea', '.vscode', 'target', 'out', 'android', 'ios'
}
IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 
    'poetry.lock', 'Gemfile.lock', 'composer.lock', 'mix.lock'
}
IGNORE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', 
    '.zip', '.tar', '.gz', '.map', '.min.js', '.min.css', '.json', '.xml', '.txt', '.md'
}

def find_repo_root(start_path: Path) -> Path:
    current = start_path.resolve()
    for parent in [current, *current.parents]:
        if (parent / ".git").exists(): return parent
    return current

def create_node(name: str, node_type: str, path: str) -> Dict[str, Any]:
    return {
        "name": name, "type": node_type, "path": path,
        "metrics": { "loc": 0, "complexity": 0, "function_count": 0 },
        "children": []
    }

def attach_file_metrics(node: Dict, file_info) -> None:
    total_loc = file_info.nloc
    node["metrics"]["loc"] = total_loc
    node["metrics"]["complexity"] = file_info.average_cyclomatic_complexity
    node["metrics"]["function_count"] = len(file_info.function_list)

    # Calculate sum of function LOCs
    func_sum_loc = 0
    
    for func in file_info.function_list:
        func_node = create_node(func.name, "function", f"{node['path']}::{func.name}")
        func_node["metrics"]["loc"] = func.nloc
        func_node["metrics"]["complexity"] = func.cyclomatic_complexity
        del func_node["children"]
        node["children"].append(func_node)
        func_sum_loc += func.nloc

    # CRITICAL FIX: Add a virtual node for the "Glue Code" (Imports, Exports, Global Vars)
    # This ensures the D3 Treemap represents the ACTUAL file size, not just the sum of functions.
    remainder = total_loc - func_sum_loc
    if remainder > 0:
        misc_node = create_node("(misc/imports)", "code_fragment", f"{node['path']}::__misc__")
        misc_node["metrics"]["loc"] = remainder
        misc_node["metrics"]["complexity"] = 0 # Glue code is usually simple
        del misc_node["children"]
        node["children"].append(misc_node)

def aggregate_metrics(node: Dict) -> Dict:
    if "children" not in node or not node["children"]: return node["metrics"]

    total_loc = 0
    max_complexity = 0
    total_funcs = 0

    for child in node["children"]:
        child_metrics = aggregate_metrics(child)
        total_loc += child_metrics.get("loc", 0)
        max_complexity = max(max_complexity, child_metrics.get("complexity", 0))
        total_funcs += child_metrics.get("function_count", 0)

    # For Folders: Sum of children
    # For Files: We trust the attach_file_metrics logic (which includes __misc__)
    if node["type"] == "folder":
        node["metrics"]["loc"] = total_loc
        node["metrics"]["complexity"] = max_complexity
        node["metrics"]["function_count"] = total_funcs
    
    return node["metrics"]

def scan_codebase():
    root = find_repo_root(Path.cwd())
    print(f"🔍 Scanning: {root}")

    files_to_scan = []
    for root_dir, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            if file in IGNORE_FILES: continue
            if Path(file).suffix in IGNORE_EXTENSIONS: continue
            files_to_scan.append(str(Path(root_dir) / file))

    print(f"📂 Analyzing {len(files_to_scan)} source files...")
    analysis = lizard.analyze_files(files_to_scan, threads=4)

    tree_root = create_node("root", "folder", str(root))
    node_map = {str(root): tree_root}

    for file_info in analysis:
        path_obj = Path(file_info.filename)
        try: rel_path = path_obj.relative_to(root)
        except ValueError: continue

        parts = rel_path.parts
        current_node = tree_root
        current_path = root

        # Build Folder Tree
        for part in parts[:-1]:
            next_path = current_path / part
            next_path_str = str(next_path)
            if next_path_str not in node_map:
                new_folder = create_node(part, "folder", next_path_str)
                current_node["children"].append(new_folder)
                node_map[next_path_str] = new_folder
            current_node = node_map[next_path_str]
            current_path = next_path

        # Add File
        file_node = create_node(parts[-1], "file", str(path_obj))
        attach_file_metrics(file_node, file_info)
        current_node["children"].append(file_node)

    aggregate_metrics(tree_root)
    
    output_path = root / "codebase_mri.json"
    with open(output_path, "w") as f: json.dump(tree_root, f, indent=2)
    print(f"✅ Saved scan to {output_path}")

if __name__ == "__main__":
    scan_codebase()