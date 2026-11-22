"""
Data-flow changes between two refs: what ``srcly compare --dataflow`` says
about where values come from and where they go now, against before.

Design
------
* **Anchors.** The changed files come from the git diff. On each side the
  engine's ``flowSignature`` op traces only the functions that overlap that
  side's changed lines (``git diff -U0`` hunks; a pure insertion or deletion
  names the two lines around it on the other side, so a function is traced on
  both sides or on neither). The head also gets the base's function names, so
  a function is "removed" only when the head really has none of that name.
* **Signature.** The op reduces each function to sets of keys: origins and
  ends (``kind:label``), origin→end pairs, parameter reads, effects, stops,
  and the status of the declaration's own trace. It builds them from the
  anchor graph (the declaration both ways, each end backward) and from
  ``functionEffects``; there is no second tracer.
* **Keys.** A key holds kinds, callee names and field paths. It holds no line
  number and no local variable's name, so a moved function or a renamed local
  has equal keys. Lines are display data, one per side.
* **Diff.** Functions match by file (renames followed) and name. Each key set
  is diffed: added, removed; the status is compared. A pair, end or read that
  is N/A on a side (Python has no parameter reads or effects; a file the
  engine could not read) is listed under "not measured", never as no change.
* **Order.** New boundary-to-boundary pairs first (a source kind that now
  reaches a sink kind), then new pairs, ends, origins, effects and reads, then
  removed ones, then status regressions and new stops, then findings deltas.
* **Limit.** Only changed functions are traced. A caller of a changed function
  is not re-traced; the report says so.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Optional

from app.services.compare.git_refs import FileChange, GitError, ResolvedRef, run_git
from app.services.dataflow.engine import EngineError
from app.services.dataflow.models import FlowSignatureResult

FORMAT = 1
TS_SUFFIXES = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
PY_SUFFIXES = (".py",)
MAX_FILES = 60
"""Changed source files traced per side; the rest are listed as not measured."""

# A value that enters from outside the program, and a place where one leaves it.
SOURCE_KINDS = {"environment", "request", "file", "network", "database", "stdin", "argument", "event", "working-directory", "external-read"}
SINK_KINDS = {"network", "database", "file", "stdout", "render", "response", "process", "exit", "message", "child-process"}
SINK_WORDS = {"render": "the DOM (render)", "stdout": "stdout", "file": "a file write", "network": "the network", "database": "the database"}
STATUS_RANK = {"ok": 0, "assumed": 1, "partial": 2, "budget": 3}
STATUS_WORDS = {"ok": "proven", "proven": "proven", "assumed": "assumed", "partial": "partial", "budget": "over budget"}
# Effects that make a function impure; external calls are already its ends.
IMPURE_FAMILIES = ("write/", "input/", "throw/", "timer/")
WHAT = {"reads": "parameter reads", "effects": "effects", "ends": "ends", "origins": "origins"}

Ranges = Optional[list[tuple[int, int]]]
"""Changed line ranges of one file on one side; None means the whole file."""


# -- which lines changed --------------------------------------------------------

_HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def changed_lines(repo: Path, base: ResolvedRef, head: ResolvedRef, changes: list[FileChange]) -> dict[str, tuple[Ranges, Ranges]]:
    """Head path → (base ranges, head ranges) for every changed source file."""
    out: dict[str, tuple[Ranges, Ranges]] = {}
    range_args = [base.sha] if head.sha is None else [base.sha, head.sha]
    cwd = head.root(repo) if head.sha is None else repo
    for change in changes:
        if not change.path.endswith(TS_SUFFIXES + PY_SUFFIXES) or change.path.endswith(".d.ts"):
            continue
        if change.status in ("added", "removed"):
            out[change.path] = (None, None)
            continue
        paths = [change.old_path, change.path] if change.old_path else [change.path]
        try:
            text = run_git(cwd, "diff", "-U0", "-M", *range_args, "--", *[p for p in paths if p])
        except GitError:
            out[change.path] = (None, None)
            continue
        old: list[tuple[int, int]] = []
        new: list[tuple[int, int]] = []
        for line in text.splitlines():
            match = _HUNK.match(line)
            if not match:
                continue
            a, b, c, d = int(match[1]), int(match[2] or 1), int(match[3]), int(match[4] or 1)
            # A side with no lines in the hunk still names where it happened: the two lines around it.
            old.append((max(a, 1), a + b - 1) if b else (max(a, 1), a + 1))
            new.append((max(c, 1), c + d - 1) if d else (max(c, 1), c + 1))
        out[change.path] = (old, new)
    return out


# -- one side -------------------------------------------------------------------


def _na(reason: str) -> dict[str, Any]:
    return {"status": "na", "reason": reason, "scopes": {}, "skipped": 0, "language": None}


def _engine_root(root: Path, path: str, registry: Any) -> tuple[Optional[Path], str, str]:
    """The folder the engine analyzes ``path`` from, the path inside it, and why not when there is none."""
    found = registry.probe(root)
    if not found.available:
        return None, path, found.message or found.reason or "The data-flow engine is unavailable"
    python = path.endswith(PY_SUFFIXES)
    if (found.language == "python") == python:
        return root, path, ""
    if not python:
        return None, path, "The root is analyzed as Python; this file is not in its program"
    for app in found.python_apps or ():
        if path.startswith(app.rstrip("/") + "/"):
            sub = root / app
            if registry.probe(sub).language == "python" and registry.probe(sub).available:
                return sub, path[len(app.rstrip("/")) + 1 :], ""
            return None, path, registry.probe(sub).message or "The Python data-flow provider is unavailable"
    return None, path, "Not in a Python app the data-flow engine analyzes"


def collect_side(
    root: Path,
    files: dict[str, Ranges],
    *,
    names: Optional[dict[str, list[str]]] = None,
    registry: Any = None,
    close_after: bool = False,
) -> dict[str, dict[str, Any]]:
    """
    Flow signatures of the changed functions of ``files`` (path relative to
    ``root`` → changed ranges) in the tree at ``root``. Never raises: a file
    the engine cannot analyze comes back ``na`` with the reason.
    """
    from app.services.dataflow import engine as dataflow_engine
    from app.services.dataflow.signals import SIGNALS_TIMEOUT

    registry = registry or dataflow_engine.registry
    root = root.resolve()
    timeout = dataflow_engine.timeout_override() or SIGNALS_TIMEOUT
    out: dict[str, dict[str, Any]] = {}
    used: set[Path] = set()
    try:
        for index, (path, ranges) in enumerate(sorted(files.items())):
            if index >= MAX_FILES:
                out[path] = _na(f"Past the cap of {MAX_FILES} changed files traced per side")
                continue
            engine_root, inner, reason = _engine_root(root, path, registry)
            if engine_root is None:
                out[path] = _na(reason)
                continue
            params: dict[str, Any] = {"file": inner}
            if ranges is not None:
                params["lines"] = [list(item) for item in ranges]
                params["names"] = (names or {}).get(path, [])
            try:
                used.add(engine_root)
                result = FlowSignatureResult.model_validate(registry.query(engine_root, "flowSignature", params, timeout=timeout))
            except EngineError as exc:
                out[path] = _na(f"Data flow not analyzed: {exc.message}")
                continue
            prefix = "" if engine_root == root else engine_root.relative_to(root).as_posix() + "/"
            scopes = {}
            for scope in result.scopes:
                data = scope.model_dump(mode="json")
                data["file"] = path
                for key in ("origins", "ends", "reads", "effects", "stops"):
                    for entry in data[key] or []:
                        entry["file"] = prefix + entry["file"]
                for pair in data["pairs"]:
                    for end in ("origin", "end"):
                        pair[end]["file"] = prefix + pair[end]["file"]
                scopes[scope.name] = data
            out[path] = {"status": "ok", "reason": "", "scopes": scopes, "skipped": result.skippedScopes, "language": result.language}
    finally:
        if close_after:
            for engine_root in used:
                registry.close(engine_root)
    return out


# -- the diff -------------------------------------------------------------------


def _declared(text: Optional[str], name: str) -> bool:
    """Whether source ``text`` declares something called ``name`` (the last part of a dotted name)."""
    if not text:
        return False
    word = re.escape(name.split(".")[-1].split("#")[0])
    return re.search(rf"(?:function\*?|def|class|const|let|var)\s+{word}\b|^\s*(?:async\s+|static\s+|public\s+|private\s+)*{word}\s*[(=:<]", text, re.M) is not None


def _where(scope: dict[str, Any]) -> dict[str, Any]:
    return {"file": scope["file"], "line": scope["line"], "status": scope["status"]}


def _change(category: str, rank: int, scope_name: str, base: Optional[dict], head: Optional[dict], **fields: Any) -> dict[str, Any]:
    side = head or base or {}
    return {
        "category": category,
        "rank": rank,
        "file": side.get("file"),
        "scope": scope_name,
        "base": _where(base) if base else None,
        "head": _where(head) if head else None,
        **fields,
    }


def _by_key(items: Optional[list[dict]]) -> Optional[dict[str, dict]]:
    return None if items is None else {item["key"]: item for item in items}


def _is_boundary(pair: dict[str, Any]) -> bool:
    return pair["origin"]["kind"] in SOURCE_KINDS and pair["end"]["kind"] in SINK_KINDS


def _scope_changes(name: str, base: Optional[dict], head: Optional[dict], not_measured: list[dict]) -> list[dict[str, Any]]:
    """Every change of one function; ``base`` or ``head`` is None for an added or removed function."""
    out: list[dict[str, Any]] = []
    note = "new function" if base is None else "removed function" if head is None else None
    empty: dict[str, Any] = {"origins": [], "ends": [], "pairs": [], "reads": [], "effects": [], "stops": [], "status": None}
    b, h = base or empty, head or empty

    def lists(field: str) -> tuple[Optional[dict[str, dict]], Optional[dict[str, dict]]]:
        return _by_key(b[field]), _by_key(h[field])

    # Pairs first: an end or origin that an added or removed pair already names is not listed again.
    before, after = lists("pairs")
    assert before is not None and after is not None
    covered: dict[str, set[str]] = {"added": set(), "removed": set()}
    for change, source, other in (("added", after, before), ("removed", before, after)):
        for key, pair in source.items():
            if key in other:
                continue
            covered[change] |= {pair["origin"]["key"], pair["end"]["key"]}
            boundary = change == "added" and _is_boundary(pair)
            out.append(
                _change(
                    "boundary-pair" if boundary else f"pair-{change}",
                    0 if boundary else (1 if change == "added" else 5),
                    name,
                    base,
                    head,
                    change=change,
                    key=key,
                    origin=pair["origin"],
                    end=pair["end"],
                    proof=pair["status"],
                    note=note,
                )
            )
    ranks = {"ends": 2, "origins": 3, "effects": 4, "reads": 4}
    for field in ("ends", "origins", "effects", "reads"):
        before, after = lists(field)
        if before is None or after is None:
            # One line per file, not per function: the reason is the language.
            entry = {"file": (head or base or {}).get("file"), "scope": None, "what": f"{WHAT[field]} of its functions", "reason": "The engine records none for this language"}
            if entry not in not_measured:
                not_measured.append(entry)
            continue
        if field == "effects":
            before = {k: v for k, v in before.items() if k.startswith(IMPURE_FAMILIES)}
            after = {k: v for k, v in after.items() if k.startswith(IMPURE_FAMILIES)}
        for change, source, other in (("added", after, before), ("removed", before, after)):
            for key, entry in source.items():
                if key in other or (field in ("ends", "origins") and key in covered[change]):
                    continue
                extra: dict[str, Any] = {}
                if field == "effects" and change == "added" and not any(k.startswith("write/") for k in other) and key.startswith("write/"):
                    extra["becameImpure"] = base is not None
                out.append(
                    _change(f"{field[:-1]}-{change}", ranks[field] if change == "added" else 6, name, base, head, change=change, key=key, item=entry, proof=entry["status"], note=note, **extra)
                )
    if base is not None and head is not None:
        was, now = base["status"], head["status"]
        if was != now:
            if was in STATUS_RANK and now in STATUS_RANK:
                worse = STATUS_RANK[now] > STATUS_RANK[was]
                out.append(_change("status-regressed" if worse else "status-improved", 7 if worse else 9, name, base, head, change="changed", key="status", before=was, after=now, proof=now, note=None))
            else:
                side = head if now not in STATUS_RANK else base
                not_measured.append({"file": side["file"], "scope": name, "what": "trace status", "reason": f"{was} → {now}: {side.get('reason') or 'no anchor at the declaration'}"})
    before, after = lists("stops")
    assert before is not None and after is not None
    if base is not None and head is not None:
        for change, source, other in (("added", after, before), ("removed", before, after)):
            for key, entry in source.items():
                if key not in other:
                    out.append(_change(f"stop-{change}", 8 if change == "added" else 9, name, base, head, change=change, key=key, item=entry, proof=entry["status"], note=None))
    return out


def _finding_key(finding: dict[str, Any]) -> tuple[str, str]:
    """A finding by its rule and the expression it names, with no line in it."""
    match = re.search(r"`([^`]+)`", finding["message"])
    return finding["rule"], match[1] if match else re.sub(r"\d+", "#", finding["message"])


def _findings_delta(base: Any, head: Any, changes: list[FileChange], not_measured: list[dict]) -> list[dict[str, Any]]:
    """Added and removed ``fileSignals`` findings, and relay-hop moves, in the changed files."""
    if base is None or head is None or base.status != "ok" or head.status != "ok":
        reason = next((s.reason for s in (base, head) if s is not None and s.status != "ok"), "Data-flow signals were not run")
        not_measured.append({"file": None, "scope": None, "what": "findings (impossible defenses, repeated forks, prop relays)", "reason": reason})
        return []
    out: list[dict[str, Any]] = []
    b_metrics = {item.file: item.metrics for item in base.result.files}
    h_metrics = {item.file: item.metrics for item in head.result.files}
    for change in changes:
        old_path = change.old_path or change.path

        def keyed(signals: Any, path: str) -> dict[tuple[str, str], list[dict]]:
            found: dict[tuple[str, str], list[dict]] = {}
            for finding in signals.result.findings:
                if finding.file == path:
                    found.setdefault(_finding_key(finding.model_dump()), []).append(finding.model_dump())
            return found

        before, after = keyed(base, old_path), keyed(head, change.path)
        for key in sorted(set(before) | set(after)):
            delta = len(after.get(key, [])) - len(before.get(key, []))
            if delta == 0:
                continue
            sample = (after if delta > 0 else before)[key][0]
            out.append(
                {
                    "category": "finding-added" if delta > 0 else "finding-removed",
                    "rank": 10,
                    "file": change.path,
                    "scope": None,
                    "base": {"file": old_path, "line": sample["line"], "status": None} if delta < 0 else None,
                    "head": {"file": change.path, "line": sample["line"], "status": None} if delta > 0 else None,
                    "change": "added" if delta > 0 else "removed",
                    "key": f"{key[0]}:{key[1]}",
                    "rule": key[0],
                    "message": sample["message"],
                    "count": abs(delta),
                    "proof": "proven",
                    "note": None,
                }
            )
        was, now = b_metrics.get(old_path), h_metrics.get(change.path)
        if was is not None and now is not None and was.relayHops != now.relayHops:
            out.append(
                {
                    "category": "relay-changed",
                    "rank": 10,
                    "file": change.path,
                    "scope": None,
                    "base": {"file": old_path, "line": 1, "status": None},
                    "head": {"file": change.path, "line": 1, "status": None},
                    "change": "changed",
                    "key": "relayHops",
                    "before": was.relayHops,
                    "after": now.relayHops,
                    "proof": "proven",
                    "note": None,
                }
            )
    return out


def diff_sides(
    base: dict[str, dict[str, Any]],
    head: dict[str, dict[str, Any]],
    changes: list[FileChange],
    *,
    base_text: Any = lambda path: None,
    base_signals: Any = None,
    head_signals: Any = None,
    with_findings: bool = True,
) -> dict[str, Any]:
    """
    The change list from two sides' signatures (each keyed by that side's own
    path). ``base_text(path)`` returns a base file's source, to tell a new
    function from one the base side did not trace.
    """
    items: list[dict[str, Any]] = []
    not_measured: list[dict[str, Any]] = []
    scopes_compared = 0
    for change in changes:
        old_path = change.old_path or change.path
        b_file = base.get(old_path) if change.status != "added" else {"status": "absent", "scopes": {}, "skipped": 0}
        h_file = head.get(change.path) if change.status != "removed" else {"status": "absent", "scopes": {}, "skipped": 0}
        if b_file is None and h_file is None:
            continue  # not a source file
        failed = False
        for side, data, path in (("base", b_file, old_path), ("head", h_file, change.path)):
            if data is None or data["status"] == "na":
                not_measured.append({"file": path, "scope": None, "what": f"the {side} side", "reason": (data or {}).get("reason") or "No signature"})
                failed = True
            elif data.get("skipped"):
                not_measured.append({"file": path, "scope": None, "what": f"{data['skipped']} functions on the {side} side", "reason": "Past the cap of functions traced per file"})
        if failed or b_file is None or h_file is None:
            continue
        for name in sorted(set(b_file["scopes"]) | set(h_file["scopes"])):
            b_scope, h_scope = b_file["scopes"].get(name), h_file["scopes"].get(name)
            if b_scope is None and b_file["status"] != "absent" and _declared(base_text(old_path), name):
                not_measured.append({"file": change.path, "scope": name, "what": "the base side", "reason": "The base's changed lines do not touch this function, so it was not traced there"})
                continue
            scopes_compared += 1
            items += _scope_changes(name, b_scope, h_scope, not_measured)
    if with_findings:
        items += _findings_delta(base_signals, head_signals, changes, not_measured)
    items.sort(key=lambda item: (item["rank"], item["file"] or "", item["scope"] or "", item["key"]))
    counts: dict[str, int] = {}
    for item in items:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    return {
        "format": FORMAT,
        "scopesCompared": scopes_compared,
        "counts": counts,
        "changes": items,
        "notMeasured": not_measured,
        "limits": ["Only functions that overlap the changed lines are traced. A caller of a changed function is not re-traced, so a change that shows only in a caller's trace is not listed."],
    }


def build(repo: Path, base_ref: ResolvedRef, head_ref: ResolvedRef, changes: list[FileChange], sides: dict[str, Any]) -> dict[str, Any]:
    """``sides`` holds what each side's checkout produced: ``{"base": {"signatures", "signals"}, "head": …}``."""

    def base_text(path: str) -> Optional[str]:
        try:
            return run_git(repo, "show", f"{base_ref.sha}:{path}")
        except GitError:
            return None

    return diff_sides(
        sides["base"]["signatures"],
        sides["head"]["signatures"],
        changes,
        base_text=base_text,
        base_signals=sides["base"].get("signals"),
        head_signals=sides["head"].get("signals"),
    )


# -- markdown -------------------------------------------------------------------


def _at(side: Optional[dict[str, Any]], line: Optional[int] = None) -> str:
    if not side:
        return "absent"
    return f"{side['file']}:{line or side['line']}"


def _proof(status: Optional[str]) -> str:
    word = STATUS_WORDS.get(status or "", status or "unknown")
    return "proven" if word == "proven" else f"**{word}**, not proven"


def _sentence(item: dict[str, Any]) -> str:
    category, scope = item["category"], item.get("scope")
    where = f"{_at(item['base'])} → {_at(item['head'])}" if item["base"] and item["head"] else _at(item["head"] or item["base"])
    who = f"`{scope}`" if scope else f"`{item['file']}`"
    note = f" ({item['note']})" if item.get("note") else ""
    if category in ("boundary-pair", "pair-added", "pair-removed"):
        origin, end = item["origin"], item["end"]
        lines = f"lines {origin['line']} → {end['line']}"
        if category == "boundary-pair":
            return f"{who}{note}: a value from **{origin['kind']}** `{origin['label']}` now reaches **{SINK_WORDS.get(end['kind'], end['kind'])}** `{end['label']}` ({where}, {lines}). Trace: {_proof(item['proof'])}."
        verb = "now sends" if category == "pair-added" else "no longer sends"
        return f"{who}{note} {verb} `{origin['label']}` ({origin['kind']}) to {end['kind']} `{end['label']}` ({where}, {lines}). Trace: {_proof(item['proof'])}."
    if "item" in item:
        entry = item["item"]
        kind, change = category.rsplit("-", 1)
        spot = f"{entry['file']}:{entry['line']}"
        words = {
            ("end", "added"): f"gained an end: {entry['kind']} `{entry['label']}`",
            ("end", "removed"): f"lost an end: {entry['kind']} `{entry['label']}`",
            ("origin", "added"): f"gained a {entry['kind']} read: `{entry['label']}`",
            ("origin", "removed"): f"lost a {entry['kind']} read: `{entry['label']}`",
            ("effect", "added"): ("became impure: it " if item.get("becameImpure") else "") + f"now has the effect {entry['kind']} on `{entry['label']}`",
            ("effect", "removed"): f"no longer has the effect {entry['kind']} on `{entry['label']}`",
            ("read", "added"): f"now reads `{entry['label']}`",
            ("read", "removed"): f"no longer reads `{entry['label']}`",
            ("stop", "added"): f"has a new stop: {entry['kind']} at `{entry['label']}`",
            ("stop", "removed"): f"lost a stop: {entry['kind']} at `{entry['label']}`",
        }[(kind, change)]
        side = "head" if change == "added" else "base"
        return f"{who}{note} {words} ({side} {spot}; function {where}). Fact: {_proof(item['proof'])}."
    if category in ("status-regressed", "status-improved"):
        return f"The trace of {who} went from {STATUS_WORDS.get(item['before'], item['before'])} to {STATUS_WORDS.get(item['after'], item['after'])} ({where})."
    if category in ("finding-added", "finding-removed"):
        verb = "gained" if category == "finding-added" else "lost"
        return f"{who} {verb} {item['count']} `{item['rule']}` finding(s): {item['message']} ({where})."
    if category == "relay-changed":
        return f"{who}: prop relay hops on its worst render path went from {item['before']} to {item['after']}."
    return f"{who}: {category}"


SECTIONS = [
    ("New boundary-to-boundary flows", ("boundary-pair",)),
    ("New flows, ends, origins, effects and reads", ("pair-added", "end-added", "origin-added", "effect-added", "read-added")),
    ("Removed", ("pair-removed", "end-removed", "origin-removed", "effect-removed", "read-removed")),
    ("Proof status and stops", ("status-regressed", "stop-added", "status-improved", "stop-removed")),
    ("Findings", ("finding-added", "finding-removed", "relay-changed")),
]


def render_markdown(result: dict[str, Any], *, limit: int = 40) -> str:
    """The "Data-flow changes" section of the compare summary; at most ``limit`` items, and it says how many it hid."""
    changes = result["changes"]
    lines = ["## Data-flow changes", ""]
    lines.append(f"{len(changes)} changes in {result['scopesCompared']} changed functions. `proven` is the engine's `ok`; an assumed or partial trace is labelled.")
    lines.append("")
    left = limit
    for title, categories in SECTIONS:
        group = [item for item in changes if item["category"] in categories]
        if not group:
            continue
        shown = group[: max(left, 0)]
        left -= len(shown)
        if not shown:
            continue
        lines += [f"### {title}", ""] + [f"- {_sentence(item)}" for item in shown] + [""]
    if not changes:
        lines += ["No data-flow change was found in the functions that were measured.", ""]
    hidden = len(changes) - min(len(changes), limit)
    if hidden > 0:
        lines += [f"The cap of {limit} items hid {hidden} more changes; `dataflow-changes.json` holds all of them.", ""]
    missing = result["notMeasured"]
    if missing:
        lines += ["### Not measured (N/A, not \"no change\")", ""]
        for entry in missing[:limit]:
            target = entry["file"] or "both sides"
            if entry.get("scope"):
                target += f" `{entry['scope']}`"
            lines.append(f"- {target}: {entry['what']}. {entry['reason']}.")
        if len(missing) > limit:
            lines.append(f"- … {len(missing) - limit} more")
        lines.append("")
    lines += [f"Limit: {text}" for text in result["limits"]]
    return "\n".join(lines) + "\n"


def default_json_path(out: Optional[str]) -> Path:
    """``dataflow-changes.json`` beside ``--out``, else in ``.srcly`` like ``srcly report``."""
    folder = Path(out).resolve().parent if out else Path(os.getcwd()) / ".srcly"
    return folder / "dataflow-changes.json"
