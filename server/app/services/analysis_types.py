from dataclasses import dataclass, field
from typing import List

@dataclass
class FunctionMetrics:
    name: str
    cyclomatic_complexity: int
    nloc: int
    start_line: int
    end_line: int
    parameter_count: int = 0
    max_nesting_depth: int = 0
    comment_lines: int = 0
    todo_count: int = 0
    # TS/TSX Specific Metrics (per-function)
    ts_type_interface_count: int = 0
    # Markdown-specific metrics
    md_data_url_count: int = 0
    # TSX structure helpers
    contains_tsx: bool = False
    tsx_start_line: int = 0
    tsx_end_line: int = 0
    tsx_root_name: str = ""
    tsx_root_is_fragment: bool = False
    origin_type: str = ""
    is_jsx_container: bool = False
    children: List["FunctionMetrics"] = field(default_factory=list)
    # We store children to represent nested functions.

@dataclass
class FileMetrics:
    nloc: int
    average_cyclomatic_complexity: float
    function_list: List[FunctionMetrics] = field(default_factory=list)
    filename: str = ""
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
    ts_type_interface_count: int = 0
    ts_export_count: int = 0
    # Python-specific metrics
    python_import_count: int = 0
    # Markdown-specific metrics (per-file)
    md_data_url_count: int = 0
