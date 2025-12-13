import os
import lizard
import multiprocessing
import time
from pathlib import Path

from app.models import Node, Metrics
from app.config import IGNORE_DIRS, IGNORE_FILES, IGNORE_EXTENSIONS
from app.services.typescript.typescript_analysis import TreeSitterAnalyzer
from app.services.markdown.markdown_analysis import MarkdownTreeSitterAnalyzer
from app.services.ipynb.ipynb_analysis import NotebookAnalyzer
from app.services.css.css_analysis import CssTreeSitterAnalyzer
from pathspec import PathSpec

# Maximum time allowed for analyzing a single file in a worker process.
PER_FILE_ANALYSIS_TIMEOUT_SECONDS: float = 10.0

# Max parallel workers for per-file analysis. Each file is analyzed in its own
# subprocess so we can enforce a *hard* timeout and terminate hung analysis.
def _default_max_workers() -> int:
    """
    Pick a reasonable default worker count close to available CPU cores.

    We keep 1 core of headroom so the main process / OS remains responsive.
    """
    cpu = os.cpu_count() or 4
    return max(1, cpu - 1)


MAX_ANALYSIS_WORKERS: int = _default_max_workers()

_ts_analyzer = None
_md_analyzer = None
_ipynb_analyzer = None
_css_analyzer = None


def get_ts_analyzer():
    global _ts_analyzer
    if _ts_analyzer is None:
        _ts_analyzer = TreeSitterAnalyzer()
    return _ts_analyzer


def get_md_analyzer():
    global _md_analyzer
    if _md_analyzer is None:
        _md_analyzer = MarkdownTreeSitterAnalyzer()
    return _md_analyzer


def get_ipynb_analyzer():
    global _ipynb_analyzer
    if _ipynb_analyzer is None:
        _ipynb_analyzer = NotebookAnalyzer()
    return _ipynb_analyzer


def get_css_analyzer():
    global _css_analyzer
    if _css_analyzer is None:
        _css_analyzer = CssTreeSitterAnalyzer()
    return _css_analyzer

_python_analyzer = None
def get_python_analyzer():
    global _python_analyzer
    if _python_analyzer is None:
        from app.services.python.python_analysis import PythonTreeSitterAnalyzer
        _python_analyzer = PythonTreeSitterAnalyzer()
    return _python_analyzer

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
        node.metrics.ts_type_interface_count = file_info.ts_type_interface_count
        node.metrics.ts_export_count = file_info.ts_export_count
    # Markdown-specific metrics
    if hasattr(file_info, "md_data_url_count"):
        node.metrics.md_data_url_count = file_info.md_data_url_count
    
    # New metrics
    if hasattr(file_info, 'comment_lines'):
        node.metrics.comment_lines = file_info.comment_lines
        node.metrics.comment_density = file_info.comment_density
        node.metrics.max_nesting_depth = file_info.max_nesting_depth
        node.metrics.average_function_length = file_info.average_function_length
        node.metrics.parameter_count = file_info.parameter_count
        node.metrics.todo_count = file_info.todo_count
        node.metrics.classes_count = file_info.classes_count
    
    if hasattr(file_info, 'python_import_count'):
        node.metrics.python_import_count = file_info.python_import_count
    
    # Set start/end line for the file (approximate, 1 to total lines)
    # We don't strictly have this from lizard always, but we can infer or leave 0.
    # For now, let's leave file start/end as 0 unless we want to read the file.
    
    # Calculate sum of function LOCs
    func_sum_loc = 0

    def _compute_function_body_loc(func_node: Node) -> int:
        """
        Compute the LOC that belongs to the *body* of a function node,
        excluding any lines that are already covered by child scopes.

        Conceptually:
            body_loc = lines_in_parent_scope
                       - union_of(lines_of_all_child_scopes)

        This ensures we only count leftover lines in the parent scope that
        are not associated with a nested child block, avoiding double
        counting in visuals like the treemap.
        """
        # We need valid line information and at least one child scope to
        # compute a meaningful body range.
        if func_node.start_line <= 0 or func_node.end_line <= 0:
            return 0
        if not func_node.children:
            return 0

        parent_start = func_node.start_line
        parent_end = func_node.end_line
        if parent_end < parent_start:
            return 0

        covered_lines: set[int] = set()
        for child in func_node.children:
            # Only consider children that have a valid, overlapping range.
            if child.start_line <= 0 or child.end_line <= 0:
                continue
            start = max(parent_start, child.start_line)
            end = min(parent_end, child.end_line)
            if end < start:
                continue
            for line in range(start, end + 1):
                covered_lines.add(line)

        total_lines = parent_end - parent_start + 1
        body_lines = total_lines - len(covered_lines)
        return max(0, body_lines)

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
        func_node.metrics.ts_type_interface_count = getattr(func, 'ts_type_interface_count', 0)
        func_node.metrics.md_data_url_count = getattr(func, 'md_data_url_count', 0)
        
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

        # After all child scopes are attached, compute a synthetic "(body)"
        # fragment that represents only the leftover lines in this function
        # that are not part of any child scope. This keeps treemap areas
        # from double-counting lines that already belong to nested children.
        body_loc = _compute_function_body_loc(func_node)
        if body_loc > 0 and func_node.children:
            body_node = create_node("(body)", "function_body", f"{func_node.path}::(body)")
            body_node.metrics.loc = body_loc
            # Any additional cyclomatic complexity should already be counted
            # on the nested child scopes; keep the glue code at 0.
            body_node.metrics.complexity = 0.0
            body_node.start_line = func_node.start_line
            body_node.end_line = func_node.end_line
            func_node.children.append(body_node)

        return func_node

    for func in file_info.function_list:
        func_node = convert_function(func, node.path)
        node.children.append(func_node)
        func_sum_loc += func.nloc

    # NOTE: We no longer create a synthetic child node for module-level "glue".
    # Any top-level/module lines should be represented as the (body) of the
    # file/module scope (handled by the newer scope-body attribution logic).


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


def _should_log_file_progress(completed_count: int, total_count: int) -> bool:
    """
    Decide whether to emit a per-file progress log.

    Rules:
    - If there are fewer than 10 files, log every file.
    - Otherwise:
      - Log the first 10 files.
      - Log at 15 and 20.
      - Log every 25th file after that (25, 50, 75, ...).
      - Always log the final file when done.
    """
    if total_count < 10:
        return True

    if completed_count <= 10:
        return True

    if completed_count in (15, 20):
        return True

    if completed_count % 25 == 0:
        return True

    if completed_count == total_count:
        return True

    return False

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
    total_type_interface_count = 0
    total_export_count = 0
    total_md_data_url_count = 0
    
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
        total_type_interface_count += child_metrics.ts_type_interface_count
        total_export_count += child_metrics.ts_export_count
        total_md_data_url_count += child_metrics.md_data_url_count
        if hasattr(child_metrics, 'python_import_count'):
             # Metric model has it, but child_metrics is a Metrics object so it should have it
             total_python_import_count = getattr(child_metrics, 'python_import_count', 0)
             # Should we add a local var for this? Yes
             pass
        
        
        # Reconstruct total function loc from average * count
        total_function_loc += (child_metrics.average_function_length * child_metrics.function_count)

    # For Folders: Sum of children
    # For Files: We trust the attach_file_metrics logic.
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
        node.metrics.ts_type_interface_count = total_type_interface_count
        node.metrics.ts_type_interface_count = total_type_interface_count
        node.metrics.ts_export_count = total_export_count
        node.metrics.md_data_url_count = total_md_data_url_count
        node.metrics.python_import_count = total_python_import_count
    
    return node.metrics

def analyze_single_file(file_path: str):
    """
    Wrapper to analyze a single file safely.
    Must be top-level for multiprocessing pickling.
    """
    try:
        if file_path.endswith(".ts") or file_path.endswith(".tsx"):
            analyzer = get_ts_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".css") or file_path.endswith(".scss"):
            analyzer = get_css_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".md") or file_path.endswith(".markdown"):
            analyzer = get_md_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".ipynb"):
            analyzer = get_ipynb_analyzer()
            return analyzer.analyze_file(file_path)
        if file_path.endswith(".py"):
             # We can cache it similarly if we want, or just instantiate. 
             # For consistency let's add a getter or just instantiate for now to avoid circular imports / global clutter
             # actually lets follow pattern
             return get_python_analyzer().analyze_file(file_path)
            
        return lizard.analyze_file(file_path)
    except Exception as e:
        # Return error info instead of crashing
        return {"error": str(e), "filename": file_path}


def _analyze_file_in_subprocess(file_path: str, send_conn) -> None:
    """
    Child-process entry point. Runs analysis and sends the result back over a pipe.
    Must be top-level for multiprocessing pickling.
    """
    try:
        result = analyze_single_file(file_path)
    except Exception as e:
        result = {"error": str(e), "filename": file_path}
    try:
        send_conn.send(result)
    except Exception:
        # If sending fails, there's nothing useful we can do here.
        pass
    finally:
        try:
            send_conn.close()
        except Exception:
            pass


def _run_file_analyses_with_hard_timeouts(
    files_to_scan: list[str],
    timeout_seconds: float,
    max_workers: int,
) -> list:
    """
    Analyze files with a *hard* per-file timeout by running each file in its own
    subprocess. This avoids the common pitfall where a ProcessPoolExecutor can
    hang forever if a worker gets stuck, because individual tasks cannot be
    force-killed reliably.
    """
    if not files_to_scan:
        return []

    ctx = multiprocessing.get_context("spawn")
    total_count = len(files_to_scan)
    completed_count = 0

    # Active entries: (process, file_path, start_time, recv_conn)
    active: list[tuple[multiprocessing.Process, str, float, object]] = []
    results: list = []

    next_index = 0
    while next_index < total_count or active:
        # Fill up worker slots.
        while next_index < total_count and len(active) < max_workers:
            file_path = files_to_scan[next_index]
            next_index += 1

            # Log every file *before* it is processed so we can identify the
            # last-started file if analysis hangs or crashes.
            print(f"➡️ [{next_index}/{total_count}] Starting analysis: {file_path}", flush=True)

            recv_conn, send_conn = ctx.Pipe(duplex=False)
            proc = ctx.Process(
                target=_analyze_file_in_subprocess,
                args=(file_path, send_conn),
                daemon=True,
            )
            start_time = time.time()
            proc.start()
            # Close the child end in the parent process to avoid leaks.
            try:
                send_conn.close()
            except Exception:
                pass

            active.append((proc, file_path, start_time, recv_conn))

        # Check running workers for completion or timeout.
        still_active: list[tuple[multiprocessing.Process, str, float, object]] = []
        now = time.time()

        for proc, file_path, start_time, recv_conn in active:
            elapsed = now - start_time

            if proc.is_alive() and elapsed <= timeout_seconds:
                still_active.append((proc, file_path, start_time, recv_conn))
                continue

            # Either finished, or timed out.
            if proc.is_alive() and elapsed > timeout_seconds:
                completed_count += 1
                print(
                    f"❌ [{completed_count}/{total_count}] Timeout analyzing {file_path} after {elapsed:.2f}s (terminated)",
                    flush=True,
                )
                try:
                    proc.terminate()
                except Exception:
                    pass
                try:
                    proc.join(timeout=1.0)
                except Exception:
                    pass
                try:
                    recv_conn.close()
                except Exception:
                    pass
                continue

            # Process finished; collect result if possible.
            try:
                proc.join(timeout=0.0)
            except Exception:
                pass

            completed_count += 1
            result = None
            try:
                # If the child crashed before sending anything, recv may raise EOFError.
                result = recv_conn.recv()
            except Exception as exc:
                result = {"error": str(exc), "filename": file_path}
            finally:
                try:
                    recv_conn.close()
                except Exception:
                    pass

            if isinstance(result, dict) and "error" in result:
                print(
                    f"❌ [{completed_count}/{total_count}] Error analyzing {file_path}: {result.get('error')}",
                    flush=True,
                )
            else:
                if _should_log_file_progress(completed_count, total_count):
                    print(f"✅ [{completed_count}/{total_count}] Analyzed {file_path}", flush=True)
                results.append(result)

        active = still_active

        # Avoid busy-looping when workers are running.
        if active and (next_index < total_count or active):
            time.sleep(0.02)

    return results


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

    print(
        f"📂 Analyzing {len(files_to_scan)} source files... (workers={MAX_ANALYSIS_WORKERS}, timeout={PER_FILE_ANALYSIS_TIMEOUT_SECONDS}s)",
        flush=True,
    )

    analysis_results = _run_file_analyses_with_hard_timeouts(
        files_to_scan=files_to_scan,
        timeout_seconds=PER_FILE_ANALYSIS_TIMEOUT_SECONDS,
        max_workers=MAX_ANALYSIS_WORKERS,
    )

    tree_root = create_node("root", "folder", str(root_path))
    node_map = {str(root_path): tree_root}

    for file_info in analysis_results:
        # Be defensive: if we ever get back an unexpected object from the
        # worker (e.g. a dict without "error", or something without a
        # ``filename`` attribute), skip it instead of crashing the whole scan.
        filename = getattr(file_info, "filename", None)
        if not filename:
            print(f"⚠️ Skipping unexpected analysis result without filename: {file_info!r}", flush=True)
            continue

        path_obj = Path(filename)
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
