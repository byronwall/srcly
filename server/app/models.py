from typing import List
from pydantic import BaseModel, Field

class Metrics(BaseModel):
    loc: int = 0
    # Max cyclomatic complexity (CCN) of any function or nested scope in this
    # node, so files and folders mean the same thing (a folder is the max of
    # its children). A function node holds its own CCN.
    complexity: float = 0.0
    # Mean CCN per function: the analyzer's per-file average for files, and
    # the function-count-weighted mean of children for folders.
    complexity_avg: float = 0.0
    function_count: int = 0
    last_modified: float = 0.0
    gitignored_count: int = 0
    file_size: int = 0
    file_count: int = 0
    
    # New metrics
    comment_lines: int = 0
    comment_density: float = 0.0
    max_nesting_depth: int = 0
    average_function_length: float = 0.0
    parameter_count: int = 0
    todo_count: int = 0
    classes_count: int = 0
    
    # TS/TSX Specific Metrics
    tsx_nesting_depth: int = 0
    tsx_render_branching_count: int = 0
    tsx_react_use_effect_count: int = 0
    tsx_anonymous_handler_count: int = 0
    tsx_prop_count: int = 0
    ts_any_usage_count: int = 0
    ts_ignore_count: int = 0
    ts_import_coupling_count: int = 0
    tsx_hardcoded_string_volume: int = 0
    tsx_duplicated_string_count: int = 0
    ts_type_interface_count: int = 0
    ts_export_count: int = 0
    
    # Python-specific metrics
    python_import_count: int = 0

    # Markdown-specific metrics
    md_data_url_count: int = 0

    # Analysis outcome. Files whose analyzer timed out, crashed, or raised stay
    # in the tree with fallback LOC/size; ``analysis_status`` says why
    # ("ok" | "timeout" | "error" | "crash"). Folders sum failed files below.
    analysis_status: str = "ok"
    analysis_error: str = ""
    analysis_failed_count: int = 0

class Node(BaseModel):
    name: str
    type: str  # "folder", "file", "function", "code_fragment"
    path: str
    metrics: Metrics
    # Use default_factory to avoid sharing the same list across instances
    children: List["Node"] = Field(default_factory=list)
    start_line: int = 0
    end_line: int = 0

    model_config = {
        "populate_by_name": True
    }

# --- Hierarchical dependency graph contract (client/src/viz/deps/contract.ts) ---

class DepGraphNode(BaseModel):
    """folder | file | symbol | external node in the dependency hierarchy."""

    model_config = {"populate_by_name": True}

    id: str
    kind: str
    name: str
    parent: str | None = None
    path: str | None = None
    abs_path: str | None = Field(default=None, alias="absPath")
    language: str | None = None
    is_test: bool | None = Field(default=None, alias="isTest")
    symbol_kind: str | None = Field(default=None, alias="symbolKind")
    line: int | None = None


class DepGraphEdge(BaseModel):
    """importer → imported; endpoints are file, symbol or external ids."""

    model_config = {"populate_by_name": True}

    source: str
    target: str
    type_only: bool | None = Field(default=None, alias="typeOnly")
    via_barrel: bool | None = Field(default=None, alias="viaBarrel")
    symbols: List[str] | None = None


class DepGraph(BaseModel):
    root: str
    nodes: List[DepGraphNode]
    edges: List[DepGraphEdge]
