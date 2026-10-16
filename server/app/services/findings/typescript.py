"""TypeScript: the project's own ``tsc`` and ``eslint``, when it has them.

A tool runs only when both its binary (``node_modules/.bin/<tool>`` at or
above the config) and its config exist. srcly never installs or configures
them. TS files no project tool covers get srcly's built-in rules instead
(``builtin_ts.py``).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Optional

from app.services.findings.model import Finding, rel_label
from app.services.findings.tools import Tool, ToolFailed, find_up, find_within, first_line, run_process, timeout_for

TS_EXTENSIONS = (".ts", ".tsx", ".mts", ".cts")
ESLINT_EXTENSIONS = TS_EXTENSIONS + (".js", ".jsx", ".mjs", ".cjs")
ESLINT_CONFIGS = frozenset({
    "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs",
    "eslint.config.ts", "eslint.config.mts", "eslint.config.cts",
    ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
})
# Bounded so a monorepo with dozens of packages can't queue an hour of tsc.
MAX_TSC_PROJECTS = 6
MAX_ESLINT_PROJECTS = 3


# -- tsconfig ----------------------------------------------------------------

_JSONC_TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/', re.S)
_TRAILING_COMMA = re.compile(r",(\s*[}\]])")


def read_jsonc(path: Path) -> dict[str, Any]:
    """tsconfig files allow comments and trailing commas."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    text = _JSONC_TOKEN.sub(lambda m: m.group(0) if m.group(0).startswith('"') else "", text)
    text = _TRAILING_COMMA.sub(r"\1", text)
    data = json.loads(text or "{}")
    return data if isinstance(data, dict) else {}


def _reference_config(base: Path, ref: str) -> Path:
    target = (base / ref).resolve()
    return target / "tsconfig.json" if target.is_dir() or not target.suffix else target


def expand_solution(config: Path, depth: int = 0) -> list[Path]:
    """
    A "solution" tsconfig (``"files": []`` plus ``references``, as Vite and
    Nx write them) checks nothing itself; check each referenced project.
    """
    try:
        data = read_jsonc(config)
    except (OSError, ValueError):
        return [config]
    refs = data.get("references") or []
    is_solution = data.get("files") == [] and not data.get("include") and refs
    if not is_solution or depth > 2:
        return [config]
    out: list[Path] = []
    for ref in refs:
        if isinstance(ref, dict) and isinstance(ref.get("path"), str):
            target = _reference_config(config.parent, ref["path"])
            if target.exists():
                out.extend(expand_solution(target, depth + 1))
    return out


def tsconfigs(root: Path, stop: Optional[Path]) -> list[Path]:
    """tsconfig.json files under ``root`` or, failing that, the nearest above it; solutions expanded."""
    found = find_within(root, frozenset({"tsconfig.json"}))
    if not found:
        start = root if root.is_dir() else root.parent
        nearest = find_up(start, "tsconfig.json", stop)
        found = [nearest] if nearest else []
    out: list[Path] = []
    for config in found:
        for project in expand_solution(config):
            if project not in out:
                out.append(project)
    return out


# -- tsc ---------------------------------------------------------------------

_TSC_DIAG = re.compile(r"^(?P<file>.+?)\((?P<line>\d+),(?P<col>\d+)\): (?P<sev>error|warning|message) (?P<code>TS\d+): (?P<msg>.*)$")
_TSC_GLOBAL = re.compile(r"^(?P<sev>error|warning) (?P<code>TS\d+): (?P<msg>.*)$")


def parse_tsc(stdout: str, cwd: Path, tool_id: str) -> tuple[list[Finding], list[str], list[str]]:
    """``tsc --pretty false --listFiles`` output → (findings, listed files, global errors)."""
    findings: list[Finding] = []
    files: list[str] = []
    global_errors: list[str] = []
    last: Optional[Finding] = None
    for raw in stdout.splitlines():
        if not raw.strip():
            continue
        if raw[:1].isspace():
            # Continuation of a multi-line message ("  Type 'x' is missing ...").
            if last is not None:
                last.message += "\n" + raw.strip()
            continue
        match = _TSC_DIAG.match(raw)
        if match:
            line = int(match["line"])
            last = Finding(
                path=os.path.realpath(os.path.join(cwd, match["file"])),
                line=line,
                end_line=line,
                column=int(match["col"]),
                rule=match["code"],
                message=match["msg"],
                severity="error" if match["sev"] == "error" else "warning",
                tool=tool_id,
            )
            findings.append(last)
            continue
        last = None
        match = _TSC_GLOBAL.match(raw)
        if match:
            global_errors.append(f"{match['code']}: {match['msg']}")
        elif os.path.isabs(raw.strip()):
            files.append(os.path.realpath(raw.strip()))
    return findings, files, global_errors


class TscTool(Tool):
    def __init__(self, root: Path, config: Path, binary: Path, label_base: Path) -> None:
        name = rel_label(config, label_base)
        super().__init__(
            id=f"tsc:{name}",
            tool="tsc",
            label=f"tsc ({name})",
            source="project",
            root=root,
            extensions=TS_EXTENSIONS,
            timeout=timeout_for("tsc"),
            signature_paths=(binary, config),
        )
        self.config = config
        self.binary = binary

    def check(self):
        cwd = self.config.parent
        cmd = [str(self.binary), "--noEmit", "--pretty", "false", "--listFiles", "-p", str(self.config)]
        out = run_process(cmd, cwd, self.timeout)
        findings, listed, global_errors = parse_tsc(out.stdout, cwd, self.id)
        if out.returncode not in (0, 1, 2) or (not listed and (global_errors or out.returncode)):
            detail = global_errors[0] if global_errors else first_line(out.stderr or out.stdout)
            raise ToolFailed(detail or f"exit code {out.returncode}")
        scope = str(self.root)
        files = [f for f in listed if f.startswith(scope) and f"{os.sep}node_modules{os.sep}" not in f]
        return [f for f in findings if f.path.startswith(scope)], files


# -- eslint ------------------------------------------------------------------


def eslint_configs(root: Path, stop: Optional[Path]) -> list[Path]:
    found = find_within(root, ESLINT_CONFIGS)
    if not found:
        start = root if root.is_dir() else root.parent
        for current in [start, *start.parents]:
            hits = sorted(current / name for name in ESLINT_CONFIGS if (current / name).exists())
            if hits:
                found = hits[:1]
                break
            if stop is not None and current == stop.resolve():
                break
    # One run per project: a config nested under another config's folder is
    # part of that project (legacy configs cascade; flat configs are per root).
    dirs: list[Path] = []
    out: list[Path] = []
    for config in sorted(found, key=lambda p: len(p.parts)):
        if any(config.parent == d or d in config.parents for d in dirs):
            continue
        dirs.append(config.parent)
        out.append(config)
    return out


def parse_eslint(stdout: str, tool_id: str) -> tuple[list[Finding], list[str]]:
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ToolFailed(f"unreadable JSON output ({exc.msg})") from exc
    if not isinstance(data, list):
        raise ToolFailed("unexpected JSON output")
    findings: list[Finding] = []
    files: list[str] = []
    for entry in data:
        path = os.path.realpath(entry.get("filePath", ""))
        files.append(path)
        for msg in entry.get("messages") or []:
            line = int(msg.get("line") or 1)
            findings.append(
                Finding(
                    path=path,
                    line=line,
                    end_line=max(line, int(msg.get("endLine") or line)),
                    column=int(msg.get("column") or 1),
                    rule=msg.get("ruleId") or ("parse" if msg.get("fatal") else "eslint"),
                    message=msg.get("message", ""),
                    severity="error" if msg.get("severity") == 2 or msg.get("fatal") else "warning",
                    tool=tool_id,
                )
            )
    return findings, files


class EslintTool(Tool):
    def __init__(self, root: Path, config: Path, binary: Path, label_base: Path) -> None:
        name = rel_label(config, label_base)
        super().__init__(
            id=f"eslint:{name}",
            tool="eslint",
            label=f"eslint ({name})",
            source="project",
            root=root,
            extensions=ESLINT_EXTENSIONS,
            timeout=timeout_for("eslint"),
            signature_paths=(binary, config),
        )
        self.config = config
        self.binary = binary

    def check(self):
        cwd = self.config.parent
        target = str(self.root) if self.root != cwd and cwd in self.root.parents else "."
        out = run_process([str(self.binary), "--format", "json", target], cwd, self.timeout)
        if out.returncode not in (0, 1):
            raise ToolFailed(first_line(out.stderr or out.stdout) or f"exit code {out.returncode}")
        findings, files = parse_eslint(out.stdout or "[]", self.id)
        scope = str(self.root)
        return [f for f in findings if f.path.startswith(scope)], [f for f in files if f.startswith(scope)]


# -- planning ----------------------------------------------------------------


def plan(root: Path, stop: Optional[Path] = None) -> list[Tool]:
    """Project tsc/eslint runs for ``root`` (none when the project has neither)."""
    label_base = stop or root
    tools: list[Tool] = []
    for config in tsconfigs(root, stop)[:MAX_TSC_PROJECTS]:
        binary = find_up(config.parent, "node_modules/.bin/tsc")
        if binary is not None:
            tools.append(TscTool(root, config, binary, label_base))
    for config in eslint_configs(root, stop)[:MAX_ESLINT_PROJECTS]:
        binary = find_up(config.parent, "node_modules/.bin/eslint")
        if binary is not None:
            tools.append(EslintTool(root, config, binary, label_base))
    return tools


def project_dirs(tools: list[Tool]) -> list[Path]:
    """Folders a project TS tool owns; the built-in rules skip them."""
    dirs = []
    for tool in tools:
        config = getattr(tool, "config", None)
        if config is not None:
            dirs.append(config.parent.resolve())
    return dirs
