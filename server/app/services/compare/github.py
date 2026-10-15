"""
Read-only GitHub PR metadata through the ``gh`` CLI.

Everything GitHub-related goes through ``run_gh``, one subprocess call with a
timeout, so tests monkeypatch a single function and the rest of compare never
depends on GitHub being reachable. ``gh`` is only ever asked to *list* and
*view*; srcly sends nothing to GitHub that ``gh`` would not send on its own.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Optional

PR_FIELDS = (
    "number,title,url,headRefName,baseRefName,headRefOid,baseRefOid,isDraft,"
    "reviewDecision,updatedAt,author,statusCheckRollup,isCrossRepository,changedFiles"
)
LIST_LIMIT = 50
CACHE_SECONDS = 60.0
DEFAULT_TIMEOUT = 10.0


class GhUnavailable(RuntimeError):
    """``gh`` could not answer. ``reason`` is short and shown to the user as-is."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _reason(stderr: str) -> str:
    text = stderr.strip()
    lower = text.lower()
    if "gh auth login" in lower or "not logged" in lower or "authentication" in lower:
        return "gh is not signed in (run gh auth login)"
    if "no git remotes" in lower or "none of the git remotes" in lower or "not a git repository" in lower:
        return "This repo has no GitHub remote"
    if any(s in lower for s in ("could not resolve", "error connecting", "dial tcp", "network", "timeout")):
        return "GitHub is unreachable (offline?)"
    first = text.splitlines()[0] if text else "gh failed"
    return first[:200]


def run_gh(repo: Path, *args: str, timeout: float = DEFAULT_TIMEOUT) -> Any:
    """Run ``gh <args>`` in ``repo`` and parse its JSON stdout. Raises ``GhUnavailable``."""
    try:
        proc = subprocess.run(
            ["gh", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            # Never prompt: a picker request must not hang on an interactive question.
            env=_env(),
        )
    except FileNotFoundError as exc:
        raise GhUnavailable("gh is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise GhUnavailable(f"gh did not answer within {timeout:g}s") from exc
    except OSError as exc:
        raise GhUnavailable(f"gh could not run: {exc}") from exc
    if proc.returncode != 0:
        raise GhUnavailable(_reason(proc.stderr or proc.stdout))
    try:
        return json.loads(proc.stdout or "null")
    except ValueError as exc:
        raise GhUnavailable("gh returned output that is not JSON") from exc


def _env() -> dict[str, str]:
    env = dict(os.environ)
    env.update({"GH_PROMPT_DISABLED": "1", "GH_NO_UPDATE_NOTIFIER": "1", "NO_COLOR": "1"})
    return env


class _Cache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[tuple, tuple[float, Any]] = {}

    def get(self, key: tuple) -> Any:
        with self._lock:
            hit = self._entries.get(key)
        if hit is None or time.monotonic() - hit[0] > CACHE_SECONDS:
            return None
        return hit[1]

    def put(self, key: tuple, value: Any) -> None:
        with self._lock:
            self._entries[key] = (time.monotonic(), value)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


_cache = _Cache()


def clear_cache() -> None:
    _cache.clear()


def list_prs(repo: Path, mine: bool = True, *, refresh: bool = False) -> list[dict[str, Any]]:
    """Open PRs for ``repo`` (yours by default), newest update first. Cached for a minute."""
    key = (str(repo), "list", mine)
    if not refresh:
        hit = _cache.get(key)
        if hit is not None:
            return hit
    args = ["pr", "list", "--state", "open", "--limit", str(LIST_LIMIT), "--json", PR_FIELDS]
    if mine:
        args += ["--author", "@me"]
    prs = run_gh(repo, *args)
    if not isinstance(prs, list):
        raise GhUnavailable("gh returned an unexpected PR list")
    prs.sort(key=lambda pr: pr.get("updatedAt") or "", reverse=True)
    _cache.put(key, prs)
    return prs


def pr_info(repo: Path, number: int) -> dict[str, Any]:
    """One PR by number, from a fresh list when it is in one, else ``gh pr view``."""
    for mine in (True, False):
        for pr in _cache.get((str(repo), "list", mine)) or []:
            if pr.get("number") == number:
                return pr
    key = (str(repo), "view", number)
    hit = _cache.get(key)
    if hit is not None:
        return hit
    pr = run_gh(repo, "pr", "view", str(number), "--json", PR_FIELDS)
    if not isinstance(pr, dict) or pr.get("number") != number:
        raise GhUnavailable(f"gh returned no data for PR #{number}")
    _cache.put(key, pr)
    return pr


def checks_summary(pr: dict[str, Any]) -> Optional[str]:
    """``pass`` / ``fail`` / ``pending`` from ``statusCheckRollup``, or None when there are no checks."""
    rollup = pr.get("statusCheckRollup") or []
    if not rollup:
        return None
    states = set()
    for check in rollup:
        state = (check.get("conclusion") or check.get("state") or check.get("status") or "").upper()
        states.add(state)
    if states & {"FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"}:
        return "fail"
    if states & {"PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", ""}:
        return "pending"
    return "pass"
