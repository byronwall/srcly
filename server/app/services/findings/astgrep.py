"""A project's own ast-grep rule pack: the YAML rules in ``.srcly/rules/``.

When ``.srcly/rules/`` (in the root or above it, up to the repo root) holds
``*.yml`` rules, srcly runs ``ast-grep scan`` with them and reports each match
under the rule's ``id``. ast-grep is found as ``SRCLY_AST_GREP``, the
project's ``node_modules/.bin/ast-grep``, or ``ast-grep`` on PATH. When it is
missing, fails or times out, the rule pack's files are N/A with the reason.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from app.services.findings.model import Finding
from app.services.findings.tools import MissingTool, Tool, ToolFailed, find_up, first_line, run_process, timeout_for

RULES_DIR = ".srcly/rules"
_LANG_EXTENSIONS = {
    "typescript": (".ts", ".mts", ".cts"),
    "ts": (".ts", ".mts", ".cts"),
    "tsx": (".tsx",),
    "javascript": (".js", ".mjs", ".cjs", ".jsx"),
    "js": (".js", ".mjs", ".cjs", ".jsx"),
    "jsx": (".jsx",),
    "python": (".py",),
    "css": (".css",),
}


def rule_files(rules_dir: Path) -> list[Path]:
    return sorted(p for p in rules_dir.glob("*.y*ml") if p.suffix in (".yml", ".yaml"))


def _languages(rules: list[Path]) -> tuple[str, ...]:
    """File extensions the rules check, from each rule's ``language:`` line."""
    out: list[str] = []
    for path in rules:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("language:"):
                lang = line.split(":", 1)[1].strip().strip("'\"").lower()
                out.extend(e for e in _LANG_EXTENSIONS.get(lang, ()) if e not in out)
    return tuple(out)


def find_binary(root: Path, stop: Optional[Path]) -> Optional[Path]:
    env = os.environ.get("SRCLY_AST_GREP")
    if env:
        return Path(env)
    local = find_up(root if root.is_dir() else root.parent, "node_modules/.bin/ast-grep", stop)
    if local is not None:
        return local
    found = shutil.which("ast-grep")
    return Path(found) if found else None


def parse_output(stdout: str, cwd: Path, tool_id: str) -> list[Finding]:
    findings = []
    for raw in stdout.splitlines():
        if not raw.strip():
            continue
        try:
            item = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ToolFailed(f"unreadable JSON output ({exc.msg})") from exc
        start = item["range"]["start"]
        end = item["range"]["end"]
        severity = "error" if item.get("severity") == "error" else "warning"
        findings.append(
            Finding(
                path=os.path.realpath(cwd / item["file"]),
                line=start["line"] + 1,
                end_line=end["line"] + 1,
                column=start["column"] + 1,
                rule=item.get("ruleId") or "ast-grep",
                message=item.get("message") or "",
                severity=severity,
                tool=tool_id,
            )
        )
    return findings


class AstGrepTool(Tool):
    def __init__(self, root: Path, binary: Path, rules_dir: Path) -> None:
        rules = rule_files(rules_dir)
        super().__init__(
            id="ast-grep",
            tool="ast-grep",
            label=f"ast-grep ({len(rules)} rules in {RULES_DIR})",
            source="project",
            root=root,
            extensions=_languages(rules),
            timeout=timeout_for("ast-grep"),
            signature_paths=(binary, *rules),
        )
        self.binary = binary
        self.rules_dir = rules_dir

    def check(self):
        cwd = self.root if self.root.is_dir() else self.root.parent
        with tempfile.TemporaryDirectory(prefix="srcly-ast-grep-") as tmp:
            config = Path(tmp) / "sgconfig.yml"
            config.write_text(f"ruleDirs:\n  - {json.dumps(str(self.rules_dir.resolve()))}\n", encoding="utf-8")
            out = run_process([str(self.binary), "scan", "-c", str(config), "--json=stream", str(self.root)], cwd, self.timeout)
        # ast-grep exits 1 when an error-severity rule matches; that is a result, not a failure.
        if out.returncode not in (0, 1) or (out.returncode == 1 and not out.stdout.strip()):
            raise ToolFailed(first_line(out.stderr) or f"exit code {out.returncode}")
        return parse_output(out.stdout, cwd, self.id), None


def plan(root: Path, stop: Optional[Path] = None) -> list[Tool]:
    rules_dir = find_up(root if root.is_dir() else root.parent, RULES_DIR, stop)
    if rules_dir is None or not rule_files(rules_dir):
        return []
    binary = find_binary(root, stop)
    if binary is None:
        reason = "ast-grep is not installed (pnpm add -D @ast-grep/cli, or set SRCLY_AST_GREP)"
        return [MissingTool("ast-grep", "ast-grep", "ast-grep", root, _languages(rule_files(rules_dir)), reason)]
    return [AstGrepTool(root, binary, rules_dir)]
