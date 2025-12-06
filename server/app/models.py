from typing import List
from pydantic import BaseModel, Field

class Metrics(BaseModel):
    loc: int = 0
    # Cyclomatic complexity can be fractional (e.g. average complexity),
    # so we store it as a float to match the analysis values.
    complexity: float = 0.0
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

class DependencyNode(BaseModel):
    id: str
    label: str
    # "file", "external", "export"
    type: str = "file"
    # For nested/compound graph layouts (e.g. exports inside file nodes)
    parent: str | None = None
    metrics: Metrics | None = None

class DependencyEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None

class DependencyGraph(BaseModel):
    nodes: List[DependencyNode]
    edges: List[DependencyEdge]
