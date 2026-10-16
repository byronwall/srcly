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
    # Comment noise flags in this scope (see comment_noise.py).
    comment_noise: int = 0
    comment_noise_ratio: int = 0
    comment_noise_docblock: int = 0
    comment_noise_commented_code: int = 0
    # React/Solid component metrics; None unless this scope is a component
    # (see typescript/components.py).
    component_loc: int | None = None
    component_hook_count: int | None = None
    component_effect_count: int | None = None
    component_jsx_depth: int | None = None
    component_prop_count: int | None = None
    component_inline_handler_count: int | None = None
    component_jsx_conditional_count: int | None = None
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

# Scope kinds. Analyzers emit a scope for every function, class, type, object
# literal, JSX container and markdown/CSS block; only "function" scopes are
# executable code. Function counts, means and the max-complexity witness use
# those alone; the rest are display scopes.
ScopeKind = str  # "function" | "class" | "type" | "object" | "jsx" | "imports" | "block"

_KIND_BY_ORIGIN: dict[str, str] = {
    # TypeScript / TSX
    "function_declaration": "function",
    "method_definition": "function",
    "arrow_function": "function",
    "function_expression": "function",
    "function": "function",
    "generator_function": "function",
    "generator_function_declaration": "function",
    "class_declaration": "class",
    "class_expression": "class",
    "interface_declaration": "type",
    "type_alias_declaration": "type",
    "object": "object",
    "jsx_element": "jsx",
    "jsx_self_closing_element": "jsx",
    "jsx_fragment": "jsx",
    "jsx_virtual_root": "jsx",
    # Python
    "function_definition": "function",
    "async_function_definition": "function",
    "lambda": "function",
    "class_definition": "class",
    # Shared
    "imports": "imports",
}


def scope_kind(func) -> ScopeKind:
    """Kind of an analyzer scope. Lizard functions carry no origin and are functions."""
    origin = getattr(func, "origin_type", "") or ""
    if not origin:
        return "function"
    return _KIND_BY_ORIGIN.get(origin, "block")


def is_executable_scope(func) -> bool:
    return scope_kind(func) == "function"


def iter_executable_scopes(funcs):
    """Every executable scope at any depth, display scopes skipped but descended."""
    for func in funcs:
        if is_executable_scope(func):
            yield func
        yield from iter_executable_scopes(getattr(func, "children", None) or [])


# Which analyzer handled a file, mirroring ``analysis.analyze_single_file``.
# The client keeps the same ids (``metricApplicability.ts``: ``MetricLanguage``).
Language = str  # "ts" | "tsx" | "python" | "notebook" | "markdown" | "css" | "code" | "text"

LANGUAGE_LABELS: dict[str, str] = {
    "ts": "TypeScript",
    "tsx": "TSX",
    "python": "Python",
    "notebook": "notebook",
    "markdown": "Markdown",
    "css": "CSS",
    "code": "lizard-analyzed",
    "text": "plain-text",
}

# Metrics an analyzer actually measures, per file and per scope. Anything not
# listed is N/A (null) for that language, never 0. LOC, size and file counts
# are always measured and aren't listed.
_CODE_CORE = frozenset({"complexity", "complexity_avg", "function_count", "average_function_length", "parameter_count"})
COMMENT_NOISE_METRICS = frozenset({
    "comment_noise",
    "comment_noise_ratio",
    "comment_noise_docblock",
    "comment_noise_commented_code",
})
_TREE_SITTER_CODE = _CODE_CORE | COMMENT_NOISE_METRICS | {"comment_lines", "max_nesting_depth", "todo_count", "classes_count"}
_TS = _TREE_SITTER_CODE | {
    "ts_any_usage_count",
    "ts_ignore_count",
    "ts_import_coupling_count",
    "ts_type_interface_count",
    "ts_export_count",
}
# Per component, and the max over a file's components (N/A with none).
COMPONENT_METRICS = frozenset({
    "component_loc",
    "component_hook_count",
    "component_effect_count",
    "component_jsx_depth",
    "component_prop_count",
    "component_inline_handler_count",
    "component_jsx_conditional_count",
})

MEASURED_FILE_METRICS: dict[str, frozenset[str]] = {
    "ts": frozenset(_TS),
    "tsx": frozenset(_TS | COMPONENT_METRICS),
    "python": frozenset(_TREE_SITTER_CODE | {"python_import_count"}),
    "code": _CODE_CORE,
    "markdown": frozenset({"md_data_url_count"}),
    "notebook": frozenset(),
    "css": frozenset(),
    "text": frozenset(),
}

_TREE_SITTER_SCOPE = frozenset({"complexity", "parameter_count", "max_nesting_depth", "comment_lines", "todo_count"}) | COMMENT_NOISE_METRICS
MEASURED_SCOPE_METRICS: dict[str, frozenset[str]] = {
    "ts": _TREE_SITTER_SCOPE | {"ts_type_interface_count"},
    "tsx": _TREE_SITTER_SCOPE | {"ts_type_interface_count"} | COMPONENT_METRICS,
    "python": _TREE_SITTER_SCOPE,
    "code": frozenset({"complexity", "parameter_count"}),
    "markdown": frozenset({"md_data_url_count"}),
    "notebook": frozenset(),
    "css": frozenset(),
    "text": frozenset(),
}

# Means over a file's functions; with no functions there is nothing to average.
MEAN_OVER_FUNCTIONS = frozenset({"complexity_avg", "average_function_length"})


@dataclass
class FileMetrics:
    nloc: int
    average_cyclomatic_complexity: float
    function_list: List[FunctionMetrics] = field(default_factory=list)
    filename: str = ""
    comment_lines: int = 0
    comment_noise: int = 0
    comment_noise_ratio: int = 0
    comment_noise_docblock: int = 0
    comment_noise_commented_code: int = 0
    max_nesting_depth: int = 0
    average_function_length: float = 0.0
    parameter_count: int = 0
    todo_count: int = 0
    classes_count: int = 0
    
    # TS/TSX Specific Metrics. Component metrics are computed from the
    # component scopes in ``analysis.attach_file_metrics``.
    ts_any_usage_count: int = 0
    ts_ignore_count: int = 0
    ts_import_coupling_count: int = 0
    ts_type_interface_count: int = 0
    ts_export_count: int = 0
    # Python-specific metrics
    python_import_count: int = 0
    # Markdown-specific metrics (per-file)
    md_data_url_count: int = 0
