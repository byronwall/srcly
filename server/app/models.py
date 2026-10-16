from typing import List
from pydantic import BaseModel, Field

class Witness(BaseModel):
    """The function responsible for a max-type metric, so the UI can open it."""

    path: str  # node path of the function: "<file>::<scope>::<name>"
    name: str
    start_line: int = 0
    end_line: int = 0


class Metrics(BaseModel):
    # Always measured: every file has lines, bytes and a mtime.
    loc: int = 0
    last_modified: float = 0.0
    gitignored_count: int = 0
    file_size: int = 0
    file_count: int = 0

    # Everything below is ``None`` (N/A) when the metric doesn't apply to the
    # node's language, the file was skipped or failed, or (for means) there are
    # no functions to average. A measured zero stays 0. ``na_reason`` says why
    # this node's ``None`` values are missing. Folder rollups ignore N/A
    # children; a folder value is ``None`` only when no child measured it.
    #
    # Max cyclomatic complexity (CCN) of any executable function in this node,
    # so files and folders mean the same thing; ``complexity_witness`` names
    # that function. A scope node holds its own CCN.
    complexity: float | None = None
    complexity_witness: Witness | None = None
    # Mean CCN over executable functions (any depth), weighted by function
    # count for folders.
    complexity_avg: float | None = None
    # Executable functions at any depth (methods, nested functions, arrows);
    # classes, types, object literals and JSX containers don't count.
    function_count: int | None = None

    comment_lines: int | None = None
    # Comment noise: flags for over-commenting on absolute thresholds (see
    # ``services/comment_noise.py``). The total and its three parts.
    comment_noise: int | None = None
    comment_noise_ratio: int | None = None
    comment_noise_docblock: int | None = None
    comment_noise_commented_code: int | None = None
    max_nesting_depth: int | None = None
    average_function_length: float | None = None
    parameter_count: int | None = None
    # Neutral detail: shown, never ranked as risk.
    todo_count: int | None = None
    classes_count: int | None = None

    # React/Solid components (TSX). A component scope holds its own values;
    # files and folders hold the max over their components, and ``witnesses``
    # names the component behind each max. N/A when there are no components.
    component_loc: int | None = None
    component_hook_count: int | None = None
    component_effect_count: int | None = None
    component_jsx_depth: int | None = None
    component_prop_count: int | None = None
    component_inline_handler_count: int | None = None
    component_jsx_conditional_count: int | None = None
    witnesses: dict[str, Witness] | None = None

    # TS/TSX Specific Metrics
    ts_any_usage_count: int | None = None
    ts_ignore_count: int | None = None
    # Neutral detail
    ts_import_coupling_count: int | None = None
    ts_type_interface_count: int | None = None
    ts_export_count: int | None = None

    # Python-specific metrics
    python_import_count: int | None = None

    # Markdown-specific metrics
    md_data_url_count: int | None = None

    # Git activity (``services/activity.py``), laid over the tree when it is
    # served: commits touching the file in the selected window, and lines
    # added + removed by them. Files and folders (sums) only; scopes are N/A.
    commit_count: int | None = None
    churn_lines: int | None = None

    # Lint and type-check findings (``services/findings``), laid over the tree
    # when it is served: everything the checkers reported for the file, and
    # the errors among them. N/A when no checker covers the file or its
    # checker failed or timed out. Files and folders (sums); scopes are N/A.
    finding_count: int | None = None
    error_count: int | None = None

    na_reason: str = ""
    # Per-metric reasons that override ``na_reason`` (activity has its own:
    # "Not a Git repository", "Shallow clone", ...).
    na_reasons: dict[str, str] | None = None

    # Analysis outcome. Files whose analyzer timed out, crashed, or raised stay
    # in the tree with fallback LOC/size; ``analysis_status`` says why
    # ("ok" | "timeout" | "error" | "crash" | "too_large"). "too_large" files are
    # over ``MAX_ANALYZED_FILE_BYTES`` and were skipped on purpose, so they do
    # not count in ``analysis_failed_count``. Folders sum failed files below.
    analysis_status: str = "ok"
    analysis_error: str = ""
    analysis_failed_count: int = 0


# Metrics that can be N/A, in display order. Rollup rules live in
# ``analysis.aggregate_metrics``.
OPTIONAL_METRIC_FIELDS: tuple[str, ...] = tuple(
    name for name, field in Metrics.model_fields.items()
    if name not in ("complexity_witness", "witnesses", "na_reasons") and field.default is None
)


class ActivityInfo(BaseModel):
    """Git activity status for a whole tree (root node only)."""

    window: str
    window_label: str
    status: str  # "ok" | "na"
    reason: str = ""
    note: str = ""  # e.g. uncommitted changes; results are still valid
    head: str = ""
    files_touched: int = 0


class FindingsTool(BaseModel):
    """One checker run: which tool, from where, and how it went."""

    id: str
    tool: str  # "tsc" | "eslint" | "ruff" | "srcly-ts"
    label: str  # "tsc (client/tsconfig.app.json)", "ruff (srcly defaults)"
    source: str  # "project" | "srcly defaults"
    status: str  # "ok" | "na"
    reason: str = ""
    seconds: float = 0.0
    finding_count: int = 0
    error_count: int = 0
    files_checked: int | None = None


class FindingsInfo(BaseModel):
    """Lint and type-check status for a whole tree (root node only)."""

    status: str  # "running" | "ok" | "na"
    reason: str = ""
    tools: List[FindingsTool] = Field(default_factory=list)
    finding_count: int = 0


class Node(BaseModel):
    name: str
    type: str  # "folder", "file", "function", "function_body"
    # For "function" nodes: the scope kind ("function" is executable code;
    # "class" | "type" | "object" | "jsx" | "imports" | "block" are display
    # scopes). ``None`` for folders, files and bodies.
    kind: str | None = None
    path: str
    metrics: Metrics
    # Use default_factory to avoid sharing the same list across instances
    children: List["Node"] = Field(default_factory=list)
    start_line: int = 0
    end_line: int = 0
    # Root only: whether Git activity could be measured, and for which window.
    activity: ActivityInfo | None = None
    # Root only: whether the checks finished, and which tools ran.
    findings: FindingsInfo | None = None

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
