"""Python: ruff, bundled with srcly, so Python findings never need setup.

With a project ruff config (``ruff.toml``, ``.ruff.toml`` or ``[tool.ruff]``
in ``pyproject.toml``) under the root or above it, ruff runs with that config.
Otherwise it runs isolated with ``SRCLY_DEFAULT_RULES``, labelled
"srcly defaults".
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from app.services.findings.model import Finding
from app.services.findings.tools import MissingTool, Tool, ToolFailed, find_within, first_line, run_process, timeout_for

# Rules that point at bugs, not style: syntax errors, pyflakes (unused and
# undefined names), bugbear, a bare ``except:`` and pylint's error class.
SRCLY_DEFAULT_RULES = ("E9", "E722", "F", "B", "PLE")
# Counted as errors; everything else is a warning. Syntax errors, undefined
# names and the like stop code from running at all.
_ERROR_PREFIXES = ("E9", "F63", "F7", "F82", "PLE")
PY_EXTENSIONS = (".py", ".pyi")
_CONFIG_NAMES = frozenset({"ruff.toml", ".ruff.toml", "pyproject.toml"})


def ruff_bin() -> Optional[Path]:
    try:
        from ruff.__main__ import find_ruff_bin
    except ImportError:
        return None
    try:
        return Path(find_ruff_bin())
    except FileNotFoundError:
        return None


def _is_ruff_config(path: Path) -> bool:
    if path.name != "pyproject.toml":
        return True
    try:
        return "[tool.ruff" in path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def project_configs(root: Path, stop: Optional[Path] = None) -> list[Path]:
    """Ruff configs that apply under ``root``: inside it, or the nearest one above it."""
    inside = [p for p in find_within(root, _CONFIG_NAMES) if _is_ruff_config(p)]
    if inside:
        return inside
    current = (root if root.is_dir() else root.parent).resolve().parent
    stop = stop.resolve() if stop else None
    while True:
        for name in ("ruff.toml", ".ruff.toml", "pyproject.toml"):
            candidate = current / name
            if candidate.exists() and _is_ruff_config(candidate):
                return [candidate]
        if current == stop or current.parent == current:
            return []
        current = current.parent


def severity_for(code: Optional[str]) -> str:
    if not code or code == "invalid-syntax":
        return "error"
    return "error" if code.startswith(_ERROR_PREFIXES) else "warning"


def parse_output(stdout: str, tool_id: str) -> list[Finding]:
    try:
        data = json.loads(stdout or "[]")
    except json.JSONDecodeError as exc:
        raise ToolFailed(f"unreadable JSON output ({exc.msg})") from exc
    if not isinstance(data, list):
        raise ToolFailed("unexpected JSON output")
    findings = []
    for item in data:
        location = item.get("location") or {}
        end = item.get("end_location") or location
        code = item.get("code") or item.get("name") or "syntax"
        line = int(location.get("row") or 1)
        findings.append(
            Finding(
                path=os.path.realpath(item.get("filename", "")),
                line=line,
                end_line=max(line, int(end.get("row") or line)),
                column=int(location.get("column") or 1),
                rule=code,
                message=item.get("message", ""),
                severity=severity_for(item.get("code")),
                tool=tool_id,
            )
        )
    return findings


class RuffTool(Tool):
    def __init__(self, root: Path, binary: Path, configs: list[Path]) -> None:
        source = "project" if configs else "srcly defaults"
        super().__init__(
            id="ruff",
            tool="ruff",
            label="ruff (project config)" if configs else "ruff (srcly defaults)",
            source=source,
            root=root,
            extensions=PY_EXTENSIONS,
            timeout=timeout_for("ruff"),
            signature_paths=(binary, *configs),
        )
        self.binary = binary
        self.configs = configs

    def command(self, *extra: str) -> list[str]:
        # No cache: srcly must not write .ruff_cache into the user's repo.
        cmd = [str(self.binary), "check", "--no-cache", "--extend-exclude", "*.ipynb", *extra]
        if not self.configs:
            cmd += ["--isolated", "--select", ",".join(SRCLY_DEFAULT_RULES)]
        return cmd + [str(self.root)]

    def check(self):
        cwd = self.root if self.root.is_dir() else self.root.parent
        # The files ruff will check (after the project's excludes), so a file
        # it skips reads N/A rather than a clean zero.
        listed = run_process(self.command("--show-files"), cwd, self.timeout)
        if listed.returncode != 0:
            raise ToolFailed(first_line(listed.stderr) or f"exit code {listed.returncode}")
        files = [os.path.realpath(line.strip()) for line in listed.stdout.splitlines() if os.path.isabs(line.strip())]
        out = run_process(self.command("--output-format", "json", "--exit-zero"), cwd, self.timeout)
        if out.returncode != 0:
            raise ToolFailed(first_line(out.stderr) or f"exit code {out.returncode}")
        return parse_output(out.stdout, self.id), [f for f in files if f.endswith(PY_EXTENSIONS)]


def plan(root: Path, stop: Optional[Path] = None) -> list[Tool]:
    binary = ruff_bin()
    if binary is None:
        return [MissingTool("ruff", "ruff", "ruff", root, PY_EXTENSIONS, "ruff is not installed")]
    return [RuffTool(root, binary, project_configs(root, stop))]

