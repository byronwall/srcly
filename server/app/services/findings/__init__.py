"""
Findings: lint and type-check results with no configuration.

Each tool runs as its own job with a timeout, outside the scan path:

- the project's ``tsc --noEmit`` per tsconfig and ``eslint`` per config, when
  ``node_modules/.bin`` has the tool and the config exists;
- ``ruff`` (bundled with srcly) for Python, with the project's config or
  srcly's default rule set ("srcly defaults");
- srcly's tree-sitter TS rules for TS files no project tool checks.

Results become two per-file metrics, ``finding_count`` and ``error_count``
(summed into folders), plus a source-linked list for the code viewer. Every
result names the tool that produced it. A tool that is missing, fails or
times out leaves its files N/A with the reason, never 0.
"""

from app.services.findings.jobs import FindingsJob, manager
from app.services.findings.model import Finding, FindingsResult, ToolRun
from app.services.findings.overlay import apply_to_tree, file_findings, markers_for
from app.services.findings.runner import collect, findings_cache, plan_tools, run_tools

__all__ = [
    "Finding",
    "FindingsJob",
    "FindingsResult",
    "ToolRun",
    "apply_to_tree",
    "collect",
    "file_findings",
    "findings_cache",
    "manager",
    "markers_for",
    "plan_tools",
    "run_tools",
]
