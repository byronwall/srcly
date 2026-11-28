"""``srcly findings``: every finding, one per line, filtered by rule, with a count per rule.

A count is a number only when every checker that could report the rule ran.
Otherwise it is N/A with the reason, so a before/after check never reads a
failed or empty run as 0. A ruff or eslint rule with no finding is N/A too:
srcly cannot tell whether the project's settings switch it on.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Optional, Sequence

from app.services.findings import copied_type_casts, typescript
from app.services.findings.model import FindingsResult, ToolRun
from app.services.findings.runner import collect, plan_tools
from app.services.findings.tools import Tool

Skipped = Sequence[tuple[str, str, str]]
"""Configured checks that were not planned: (tool, label, reason)."""

SKIPPED_RULES = {"srcly-casts": (copied_type_casts.RULE,)}
"""The rules a skipped srcly checker would have reported."""


def _family(rule: str) -> str:
    """The project tool that names rules this way."""
    if re.fullmatch(r"TS\d+", rule):
        return "tsc"
    if re.fullmatch(r"[A-Z]+\d+", rule) or rule in ("syntax", "invalid-syntax"):
        return "ruff"
    return "eslint"


def _blockers(
    rule: Optional[str], tools: Sequence[Tool], runs: dict[str, ToolRun], skipped: Skipped, reporters: set[str]
) -> list[str]:
    """
    Why the count for ``rule`` (``None``: all rules) is not complete; empty
    when it is. ``reporters``: the tools that found something for ``rule``.
    """
    checkers, left_out, name = list(tools), list(skipped), "checker"
    if rule is not None:
        owners = [t for t in tools if rule in t.rules]
        skipped_owners = [s for s in skipped if rule in SKIPPED_RULES.get(s[0], ())]
        # An ast-grep id is the project's choice, so it may also be an eslint rule's name.
        shared = all(t.tool == "ast-grep" for t in owners)
        family = None if owners or skipped_owners else _family(rule)
        if owners and shared:
            family = "eslint"
        checkers = [t for t in tools if t in owners or t.tool == family or t.id in reporters]
        left_out = [s for s in skipped if s[0] == family or s in skipped_owners]
        name = " or ".join(t.label for t in owners) or f"{family} run"
    why = [runs[t.id].reason for t in checkers if not runs[t.id].ok]
    why += [f"{label} not run: {reason}" for _, label, reason in left_out]
    # ``files`` is None when a tool does not say what it checked.
    if not why and not any(runs[t.id].files != [] for t in checkers):
        why = [f"no {name} checked a file"]
    if not why and rule is not None and not reporters and not owners and family != "tsc":
        why = [f"no finding, and srcly cannot tell whether {family} has this rule switched on"]
    return why


def build(
    root: Path, result: FindingsResult, tools: Sequence[Tool], rules: Sequence[str] = (), skipped: Skipped = ()
) -> dict:
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

    reporters: dict[str, set[str]] = {}
    for row in rows:
        reporters.setdefault(row["rule"], set()).add(row["tool"])

    def entry(of: Sequence[Optional[str]], n: int) -> dict:
        why = list(
            dict.fromkeys(
                reason for rule in of for reason in _blockers(rule, tools, runs, skipped, reporters.get(rule, set()))
            )
        )
        return {"count": None if why else n, "found": n, "reason": "; ".join(why)}

    known = sorted({r for t in tools for r in t.rules})
    return {
        "root": str(root),
        "filter": wanted,
        # The total over the wanted rules (all rules without a filter).
        **entry(wanted or [None], len(rows)),
        "rules": [{"rule": rule, **entry([rule], found[rule])} for rule in wanted or sorted(found)],
        # A misspelled rule would otherwise read as a clean 0.
        "unknown_rules": [r for r in wanted if r not in known and not found[r]],
        "known_rules": known,
        "findings": rows,
        "not_checked": [{"checker": r.label, "reason": r.reason} for r in result.tools if not r.ok]
        + [{"checker": label, "reason": reason} for _, label, reason in skipped],
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
    if len(payload["filter"]) != 1:
        lines.append(f"Total: {count(payload)}")
    lines += [f"Not checked: {t['checker']}: {t['reason']}" for t in payload["not_checked"]]
    if payload["unknown_rules"]:
        lines.append(
            f"No finding and not a known rule: {', '.join(payload['unknown_rules'])}. Check the spelling. "
            f"Known rules: {', '.join(payload['known_rules'])}."
        )
    return "\n".join(lines)


def run(root: Path, rules: Sequence[str] = (), fmt: str = "md", refresh: bool = False) -> str:
    """The findings for ``root`` (from the cache ``report`` fills while files are unchanged)."""
    from app.services import cache
    from app.services.analysis import find_repo_root

    root = root.resolve()
    stop = find_repo_root(root if root.is_dir() else root.parent)
    tools = plan_tools(root, stop=stop)
    result = collect(root, fingerprint=cache.fingerprint(root), tools=tools, use_cache=not refresh)
    skipped = typescript.unscheduled(root, stop) + copied_type_casts.unscheduled(root, stop)
    payload = build(root, result, tools, rules, skipped)
    return json.dumps(payload, indent=2) if fmt == "json" else render(payload)
