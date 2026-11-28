"""``srcly findings``: every finding, one per line, filtered by rule, with a count per rule.

A count is a number only when every checker that could report the rule ran.
Otherwise it is N/A with the reason, so a before/after check never reads a
failed or empty run as 0.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Optional, Sequence

from app.services.findings.model import FindingsResult, ToolRun
from app.services.findings.runner import collect, plan_tools
from app.services.findings.tools import Tool


def _blockers(rule: Optional[str], tools: Sequence[Tool], runs: dict[str, ToolRun]) -> list[str]:
    """Why the count for ``rule`` (``None``: all rules) is not complete; empty when it is."""
    owners = [t for t in tools if rule in t.rules]
    if owners:
        out = [runs[t.id].reason for t in owners if not runs[t.id].ok]
        if not out and all(runs[t.id].files == [] for t in owners):
            out = [f"{t.label} found no files it checks" for t in owners]
        return out
    # Not one of srcly's own rules: any project tool that failed might have reported it.
    return [runs[t.id].reason for t in tools if not runs[t.id].ok and (rule is None or not t.rules)]


def build(root: Path, result: FindingsResult, tools: Sequence[Tool], rules: Sequence[str] = ()) -> dict:
    """The payload both formats print. Paths are relative to ``root``."""
    runs = {r.id: r for r in result.tools}
    wanted = list(dict.fromkeys(rules))
    rows = []
    for f in result.findings:
        if wanted and f.rule not in wanted:
            continue
        path = Path(f.path)
        rows.append(
            {
                "path": path.relative_to(root).as_posix() if path.is_relative_to(root) else f.path,
                "line": f.line,
                "column": f.column,
                "rule": f.rule,
                "severity": f.severity,
                "tool": f.tool,
                "message": " ".join(f.message.split()),
            }
        )
    found = Counter(row["rule"] for row in rows)

    def entry(of: Sequence[Optional[str]], n: int) -> dict:
        why = list(dict.fromkeys(reason for rule in of for reason in _blockers(rule, tools, runs)))
        return {"count": None if why else n, "found": n, "reason": "; ".join(why)}

    own = sorted(r for t in tools for r in t.rules)
    return {
        "root": str(root),
        # The total over the wanted rules (all rules without a filter).
        **entry(wanted or [None], len(rows)),
        "rules": [{"rule": rule, **entry([rule], found[rule])} for rule in wanted or sorted(found)],
        # A misspelled rule would otherwise read as a clean 0.
        "unknown_rules": [r for r in wanted if r not in own and not found[r]],
        "srcly_rules": own,
        "findings": rows,
        "not_checked": [{"checker": r.label, "reason": r.reason} for r in result.tools if not r.ok],
    }


def render(payload: dict) -> str:
    def count(e: dict) -> str:
        if e["count"] is not None:
            return str(e["count"])
        return f"N/A ({e['reason']}; {e['found']} found by the checkers that ran)"

    lines = [f"{f['path']}:{f['line']} {f['rule']} {f['message']}" for f in payload["findings"]]
    if lines:
        lines.append("")
    lines += [f"{e['rule']}: {count(e)}" for e in payload["rules"]]
    if len(payload["rules"]) != 1:
        lines.append(f"Total: {count(payload)}")
    lines += [f"Not checked: {t['checker']}: {t['reason']}" for t in payload["not_checked"]]
    if payload["unknown_rules"]:
        lines.append(
            f"No finding and not a srcly rule: {', '.join(payload['unknown_rules'])}. Check the spelling "
            f"(a tsc, eslint, ruff or ast-grep rule can be 0). srcly rules: {', '.join(payload['srcly_rules'])}."
        )
    return "\n".join(lines)


def run(root: Path, rules: Sequence[str] = (), fmt: str = "md", refresh: bool = False) -> str:
    """The findings for ``root`` (from the cache ``report`` fills while files are unchanged)."""
    from app.services import cache

    root = root.resolve()
    tools = plan_tools(root)
    result = collect(root, fingerprint=cache.fingerprint(root), tools=tools, use_cache=not refresh)
    payload = build(root, result, tools, rules)
    return json.dumps(payload, indent=2) if fmt == "json" else render(payload)
