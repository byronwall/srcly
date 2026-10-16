"""The metric catalog: one definition per metric, for every surface.

The client fetches it from ``GET /api/metrics/catalog`` (picker, explorer
columns, treemap color, tooltips, code viewer, Hot Spots). ``reporting``
builds its profile weights and metrics schema from it, and ``compare/diff``
its better/worse table. Adding a metric means one ``MetricSpec`` here plus
the analyzer that computes it (see ``AGENTS.md``).

Which languages measure a metric, and whether scopes carry it, is not
repeated here: it comes from the analyzers' own tables in
``analysis_types`` (``MEASURED_FILE_METRICS`` / ``MEASURED_SCOPE_METRICS``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.analysis_types import ACTIVITY_METRICS, MEASURED_FILE_METRICS, MEASURED_SCOPE_METRICS

Direction = Literal["higher-worse", "lower-worse", "neutral"]
Aggregation = Literal["sum", "max", "mean"]
CompareRole = Literal["direction", "neutral", "skip"]
Cohort = Literal["file", "function"]

GROUPS: tuple[tuple[str, str], ...] = (
    ("General", "Size, complexity and comment noise for any code file."),
    ("Components", "React/Solid components in TSX: a file holds the max over its components and names it."),
    ("TypeScript", "Type-safety escapes in .ts and .tsx files."),
    ("Markdown", "Markdown documents."),
    ("Activity", "Git history per file in the selected window (90 days by default). On whenever the folder is a Git repo."),
    ("Detail", "Counts that describe code without saying it needs work: shown and colorable, never ranked."),
)

PROFILES = ("general", "frontend", "backend", "typescript", "python", "docs")


@dataclass(frozen=True)
class MetricSpec:
    id: str
    label: str
    short_label: str
    """Explorer column header, at most 5 characters."""
    unit: str
    """Plural unit shown after a value ("lines"); ``unit_one`` is the singular."""
    unit_one: str
    group: str
    direction: Direction
    aggregation: Aggregation
    """How files roll up into folders (and compare totals over changed files)."""
    description: str
    witness: bool = False
    """File and folder values name the function or component that sets the max."""
    color_domain: tuple[float, float, float] = (0, 10, 50)
    """Treemap ramp stops: [fine, midpoint, needs attention]."""
    color_per_file: bool = False
    """Color folders by their per-file average (sums outgrow any file scale)."""
    viewer_label: str | None = None
    """Label in the code viewer's metrics table, when ``label`` reads as a ranking."""
    compare: CompareRole = "direction"
    """``neutral``: growth is expected in a PR (size); ``skip``: not compared."""
    picker: bool = True
    """False for bookkeeping the explorer shows elsewhere (file count)."""
    weights: dict[str, float] = field(default_factory=dict)
    """Report profile weights for the composite findings ranking. Risk metrics only."""

    @property
    def languages(self) -> list[str] | None:
        """Languages whose analyzers measure it; ``None`` when every file has it."""
        langs = [lang for lang, measured in MEASURED_FILE_METRICS.items() if self.id in measured]
        return langs or None

    @property
    def scope(self) -> Literal["file", "any"]:
        """``any`` when function/component scopes carry their own value too."""
        if self.id in ACTIVITY_METRICS:
            return "file"
        if self.id == "loc" or any(self.id in measured for measured in MEASURED_SCOPE_METRICS.values()):
            return "any"
        return "file"

    @property
    def rankable(self) -> bool:
        return self.direction != "neutral"

    def unit_for(self, value: float) -> str:
        return self.unit_one if value == 1 else self.unit

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "short_label": self.short_label,
            "unit": self.unit,
            "unit_one": self.unit_one,
            "group": self.group,
            "direction": self.direction,
            "aggregation": self.aggregation,
            "scope": self.scope,
            "languages": self.languages,
            "description": self.description,
            "witness": self.witness,
            "color_domain": list(self.color_domain),
            "color_per_file": self.color_per_file,
            "viewer_label": self.viewer_label,
            "picker": self.picker,
        }


def _component(id: str, label: str, short: str, unit: tuple[str, str], description: str, domain, weights) -> MetricSpec:
    return MetricSpec(
        id,
        label,
        short,
        unit[1],
        unit[0],
        "Components",
        "higher-worse",
        "max",
        f"{description} A file or folder holds the max over its components and names it.",
        witness=True,
        color_domain=domain,
        weights=weights,
    )


_NOISE = "Comment noise"

METRICS: tuple[MetricSpec, ...] = (
    # General
    MetricSpec(
        "complexity", "Complexity (max)", "CCN", "CCN", "CCN", "General", "higher-worse", "max",
        "Cyclomatic complexity: exact for a function; for a file or folder, its most complex function, which it names.",
        witness=True,
        weights={"general": 1.5, "frontend": 1.0, "backend": 1.6, "typescript": 1.0, "python": 1.4},
    ),
    MetricSpec(
        "complexity_avg", "Complexity (avg)", "CCNμ", "CCN", "CCN", "General", "higher-worse", "mean",
        "Mean cyclomatic complexity per function; folders weight by function count.",
    ),
    MetricSpec(
        "loc", "LOC", "LOC", "lines", "line", "General", "higher-worse", "sum",
        "Lines of code, excluding comments and blanks where the analyzer can tell.",
        # A 200-line file or function is worth a look; 800 lines wants splitting.
        color_domain=(0, 200, 800), color_per_file=True, compare="neutral",
        weights={"general": 1.1, "frontend": 0.8, "backend": 1.0, "python": 1.0, "docs": 0.8},
    ),
    MetricSpec(
        "file_size", "Size", "Size", "bytes", "byte", "General", "neutral", "sum",
        "File size in bytes.",
        # About 50 bytes per line, so this tracks the LOC stops.
        color_domain=(0, 10_000, 40_000), color_per_file=True, viewer_label="Size (bytes)", compare="neutral",
    ),
    MetricSpec(
        "comment_noise", "Comment Noise", "Noise", "flags", "flag", "General", "higher-worse", "sum",
        "Over-commenting flags: functions over 50% comments (10+ code lines), docblocks over 1.5x their body (8+ lines), and 3+ line runs of commented-out code.",
        # One flag is worth a look, five is a pattern.
        color_domain=(0, 1, 5),
        weights={"general": 0.7, "backend": 0.6, "typescript": 0.6, "python": 0.8},
    ),
    MetricSpec(
        "max_nesting_depth", "Nesting", "Nest", "levels", "level", "General", "higher-worse", "max",
        "Deepest control-flow nesting.",
        color_domain=(0, 3, 8),
        weights={"general": 1.0, "backend": 1.2, "python": 1.0},
    ),
    MetricSpec(
        "parameter_count", "Params", "Prm", "params", "param", "General", "higher-worse", "sum",
        "Function parameters; a file sums its functions.",
        weights={"general": 0.6, "backend": 0.9, "python": 0.8},
    ),
    MetricSpec(
        "average_function_length", "Function Length (avg)", "FnLen", "lines", "line", "General", "higher-worse", "mean",
        "Mean function length in LOC; folders weight by function count.",
        color_domain=(0, 30, 100),
    ),
    # Components
    _component("component_loc", "Component LOC", "CLOC", ("line", "lines"),
               "Lines in one React/Solid component.",
               (0, 150, 400), {"general": 0.8, "frontend": 1.3}),
    _component("component_hook_count", "Hooks", "Hooks", ("hook", "hooks"),
               "Hooks (`use*`) and Solid primitives (`create*`) in one component.",
               (0, 5, 15), {"frontend": 1.1}),
    _component("component_effect_count", "Effects", "Eff", ("effect", "effects"),
               "`useEffect`/`useLayoutEffect`/`createEffect` calls in one component.",
               (0, 2, 6), {"frontend": 1.2}),
    _component("component_jsx_depth", "JSX Depth", "JSXd", ("level", "levels"),
               "Deepest JSX nesting inside one component.",
               (0, 6, 12), {"frontend": 0.9}),
    _component("component_prop_count", "Props", "Props", ("prop", "props"),
               "Declared props of one component (props type members or destructured names).",
               (0, 8, 20), {"frontend": 0.8}),
    _component("component_inline_handler_count", "Inline Handlers", "Hndl", ("handler", "handlers"),
               "Inline `on*={() => ...}` handlers in one component.",
               (0, 5, 15), {"frontend": 0.7}),
    _component("component_jsx_conditional_count", "JSX Conditionals", "JSX?", ("conditional", "conditionals"),
               "JSX conditionals (`?:`, `&&`, `<Show>`, `<Match>`) in one component.",
               (0, 5, 15), {"frontend": 1.0, "typescript": 0.8}),
    # TypeScript
    MetricSpec(
        "ts_any_usage_count", "any Usage", "any", "uses", "use", "TypeScript", "higher-worse", "sum",
        "Explicit `any` types.",
        color_domain=(0, 3, 15),
        weights={"general": 0.8, "typescript": 1.4},
    ),
    MetricSpec(
        "ts_ignore_count", "TS Ignores", "Ign@", "directives", "directive", "TypeScript", "higher-worse", "sum",
        "`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` directives.",
        color_domain=(0, 1, 5),
        weights={"general": 0.9, "typescript": 1.4},
    ),
    # Markdown
    MetricSpec(
        "md_data_url_count", "Markdown Data URLs", "DURL", "data URLs", "data URL", "Markdown", "higher-worse", "sum",
        "Inline `data:` URLs (embedded images) in Markdown.",
        color_domain=(0, 1, 5),
        weights={"general": 0.4, "docs": 1.6},
    ),
    # Activity: from Git history (services/activity.py), per file; scopes are N/A.
    MetricSpec(
        "commit_count", "Commits", "Cmts", "commits", "commit", "Activity", "higher-worse", "sum",
        "Non-merge commits that touched the file in the activity window, following renames. Frequent change in complex code is where refactoring pays off.",
        # Weekly-ish change over 90 days is busy; near-daily is a hot spot.
        color_domain=(0, 5, 25), color_per_file=True, compare="neutral",
    ),
    MetricSpec(
        "churn_lines", "Churn", "Churn", "lines", "line", "Activity", "higher-worse", "sum",
        "Lines added plus removed by those commits. Kept apart from commit count: one bulk rewrite churns a lot in a single commit.",
        color_domain=(0, 200, 2_000), color_per_file=True, compare="neutral",
    ),
    # Detail: describes code without saying it needs work.
    MetricSpec(
        "todo_count", "TODOs", "TODO", "TODOs", "TODO", "Detail", "neutral", "sum",
        "TODO/FIXME-style comments.", color_domain=(0, 1, 5),
    ),
    MetricSpec(
        "comment_noise_ratio", "Narrated Code", "NRat", "flags", "flag", "Detail", "neutral", "sum",
        f"{_NOISE} part: functions (or a whole file) over 50% comment lines with 10+ code lines.",
        color_domain=(0, 1, 5), viewer_label="Noise: comment ratio",
    ),
    MetricSpec(
        "comment_noise_docblock", "Oversized Docblocks", "NDoc", "flags", "flag", "Detail", "neutral", "sum",
        f"{_NOISE} part: docblocks or docstrings of 8+ lines that are over 1.5x their function's code lines.",
        color_domain=(0, 1, 5), viewer_label="Noise: docblocks",
    ),
    MetricSpec(
        "comment_noise_commented_code", "Commented-out Code", "NCode", "flags", "flag", "Detail", "neutral", "sum",
        f"{_NOISE} part: runs of 3+ line comments that parse as code.",
        color_domain=(0, 1, 5), viewer_label="Noise: commented-out code",
    ),
    MetricSpec(
        "comment_lines", "Comment Lines", "Cmt", "lines", "line", "Detail", "neutral", "sum",
        "Comment lines.", color_domain=(0, 100, 400), color_per_file=True,
    ),
    MetricSpec(
        "function_count", "Functions", "Fns", "functions", "function", "Detail", "neutral", "sum",
        "Executable functions at any depth (methods, nested functions, arrows).",
        color_domain=(0, 15, 50), color_per_file=True,
    ),
    MetricSpec(
        "classes_count", "Classes", "Cls", "classes", "class", "Detail", "neutral", "sum",
        "Class declarations.", color_domain=(0, 3, 10),
    ),
    MetricSpec(
        "ts_import_coupling_count", "TS Imports", "Imp", "sources", "source", "Detail", "neutral", "sum",
        "Distinct import sources.", color_domain=(0, 10, 30),
    ),
    MetricSpec(
        "ts_type_interface_count", "Types/Interfaces", "Type", "declarations", "declaration", "Detail", "neutral", "sum",
        "Type and interface declarations.", color_domain=(0, 5, 20),
    ),
    MetricSpec(
        "ts_export_count", "Exports", "Exp", "exports", "export", "Detail", "neutral", "sum",
        "Export declarations.", color_domain=(0, 10, 30),
    ),
    MetricSpec(
        "python_import_count", "Python Imports", "PyImp", "imports", "import", "Detail", "neutral", "sum",
        "Import statements.", color_domain=(0, 10, 30),
    ),
    MetricSpec(
        "file_count", "Files", "Files", "files", "file", "Detail", "neutral", "sum",
        "Files a node represents.", compare="skip", picker=False,
    ),
)

METRICS_BY_ID: dict[str, MetricSpec] = {m.id: m for m in METRICS}
RANKABLE_IDS: tuple[str, ...] = tuple(m.id for m in METRICS if m.rankable)


def get(metric_id: str) -> MetricSpec:
    try:
        return METRICS_BY_ID[metric_id]
    except KeyError:
        raise ValueError(f"Unknown metric: {metric_id}") from None


def profile_weights() -> dict[str, dict[str, float]]:
    """``{profile: {metric: weight}}`` in catalog order."""
    out: dict[str, dict[str, float]] = {name: {} for name in PROFILES}
    for metric in METRICS:
        for profile, weight in metric.weights.items():
            out[profile][metric.id] = weight
    return out


def profile_lead(profile: str) -> str:
    """The metric a profile weights most (first in catalog order on ties)."""
    weights = profile_weights()[profile]
    return max(weights, key=lambda metric: weights[metric])


def catalog_payload() -> dict[str, Any]:
    from app.services import activity, quadrants

    return {
        "groups": [{"id": gid, "description": description} for gid, description in GROUPS],
        "metrics": [m.to_json() for m in METRICS],
        "activity_windows": list(activity.iter_windows()),
        "default_activity_window": activity.DEFAULT_WINDOW,
        "quadrant_presets": quadrants.presets_payload(),
    }
