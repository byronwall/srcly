import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from app.services import metric_catalog, reporting
from app.services.scan_workers import ScanCancelled

# Seconds uvicorn waits for open connections after Ctrl+C before closing them.
GRACEFUL_SHUTDOWN_SECONDS = 3
# Conventional exit status for a process stopped by SIGINT.
EXIT_INTERRUPTED = 130


def _open_browser_later(url: str, delay: float = 1.0) -> None:
    """
    Open the default web browser after a short delay.

    This lets the server start first so the page is reachable.
    """

    def _worker() -> None:
        time.sleep(delay)
        try:
            webbrowser.open(url)
        except Exception:
            # Don't crash the CLI if opening the browser fails (e.g. headless env)
            pass

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def _find_repo_root(start_path: str) -> str:
    """
    Walk upwards from ``start_path`` to find a Git repository root.

    Returns the first directory that contains a `.git` directory or file.
    If none is found, the original ``start_path`` is returned.
    """
    current = os.path.abspath(start_path)

    while True:
        git_path = os.path.join(current, ".git")
        if os.path.exists(git_path):
            return current

        parent = os.path.dirname(current)
        if parent == current:
            # Reached filesystem root; fall back to the original start path.
            return os.path.abspath(start_path)

        current = parent


def main(argv: list[str] | None = None) -> None:
    """CLI entry point. Ctrl+C exits promptly with status 130 and no traceback."""
    try:
        _main(argv)
    except (KeyboardInterrupt, ScanCancelled):
        print("\nStopped.", file=sys.stderr, flush=True)
        raise SystemExit(EXIT_INTERRUPTED)


def _main(argv: list[str] | None = None) -> None:
    """
    Parse arguments and dispatch.

    - With no path argument, uses the enclosing Git repo root as the codebase root.
    - If a path is provided (including "."), uses that as the codebase root.
    - Starts the FastAPI server.
    - Opens the default browser to the app URL.
    """
    argv = list(argv) if argv is not None else sys.argv[1:]
    if argv and argv[0] in {"scan", "report", "hotspots", "explain", "compare"}:
        _run_headless(argv)
        return

    parser = argparse.ArgumentParser(
        prog="srcly",
        description=(
            "Interactive codebase treemap and metrics viewer. "
            "By default, analyzes the enclosing Git repository root."
        ),
    )
    parser.add_argument(
        "path",
        nargs="?",
        help=(
            "Path to the codebase to analyze. "
            "If omitted, the enclosing Git repo root is used. "
            'Use "." explicitly to analyze the current directory.'
        ),
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind the server to (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to run the server on (default: random free port).",
    )

    args = parser.parse_args(argv)

    if args.path is None:
        target_path = _find_repo_root(os.getcwd())
    else:
        target_path = os.path.abspath(args.path)

    if not os.path.exists(target_path):
        raise SystemExit(f"Path does not exist: {target_path}")

    # Change working directory so the API defaults to this path.
    os.chdir(target_path)
    print(f"📂 Analyzing codebase at: {target_path}")

    port = args.port
    if port is None:
        # Find a random free port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("", 0))
            port = s.getsockname()[1]

    url = f"http://{args.host}:{port}"
    print(f"🚀 Starting server at {url}")
    print("   Press Ctrl+C to stop.")

    _open_browser_later(url)

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=port,
        reload=False,
        timeout_graceful_shutdown=GRACEFUL_SHUTDOWN_SECONDS,
    )


def _resolve_target_path(path: str | None) -> Path:
    if path is None:
        target_path = Path(_find_repo_root(os.getcwd()))
    else:
        target_path = Path(path).resolve()

    if not target_path.exists():
        raise SystemExit(f"Path does not exist: {target_path}")
    return target_path


def _run_headless(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(
        prog="srcly",
        description="Headless Srcly analysis commands for agents and CI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan_parser = subparsers.add_parser("scan", help="Write the raw analysis tree as JSON.")
    scan_parser.add_argument("path", nargs="?", help="Path to analyze. Defaults to the enclosing Git repo root.")
    scan_parser.add_argument("--out", default="codebase_mri.json", help="Output JSON file.")
    scan_parser.add_argument("--refresh", action="store_true", help="Ignore cache when cache support is available.")
    scan_parser.add_argument("--format", choices=["json", "jsonl"], default="json", help="Output format. JSONL is reserved.")
    scan_parser.add_argument(
        "--include-source",
        choices=["false", "snippets", "none"],
        default="none",
        help="Reserved source inclusion mode. Full source is not emitted.",
    )

    report_parser = subparsers.add_parser("report", help="Write agent-ready report artifacts.")
    report_parser.add_argument("path", nargs="?", help="Path to analyze. Defaults to the enclosing Git repo root.")
    report_parser.add_argument("--out", default=".srcly", help="Output artifact directory.")
    report_parser.add_argument(
        "--stdout",
        action="store_true",
        help="Emit one compact bundled JSON report to stdout instead of writing artifact files.",
    )
    report_parser.add_argument("--refresh", action="store_true", help="Ignore cache when cache support is available.")
    report_parser.add_argument("--limit", type=int, default=50, help="Maximum ranked findings to emit.")
    report_parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-file scan progress to stderr. Reports are quiet by default.",
    )
    report_parser.add_argument(
        "--agent-compact",
        action="store_true",
        help="Expand compact agent artifacts from the default top 10 findings to the top 20.",
    )
    report_parser.add_argument(
        "--focus",
        action="append",
        default=None,
        help="Path prefix to promote in report ranking. May be repeated.",
    )
    report_parser.add_argument(
        "--deprioritize",
        action="append",
        default=None,
        help="Path prefix to lower in report ranking. May be repeated. Defaults include .agents and docs/idea.",
    )
    report_parser.add_argument(
        "--no-default-deprioritize",
        action="store_true",
        help="Disable default report deprioritization for agent docs, vendored, and generated-like paths.",
    )
    report_parser.add_argument(
        "--profile",
        choices=["general", "frontend", "backend", "typescript", "python", "docs"],
        default="general",
        help="Profile for the weighted findings queue.",
    )
    report_parser.add_argument(
        "--metric",
        choices=metric_catalog.RANKABLE_IDS,
        default=None,
        help="Metric for the Top Files / Top Functions tables and hotspots.json. Defaults to the profile's heaviest metric.",
    )
    report_parser.add_argument(
        "--format",
        choices=["markdown", "json", "both"],
        default="both",
        help="Artifact formats to write.",
    )
    report_parser.add_argument(
        "--fail-on",
        choices=["high", "medium", "none"],
        default="none",
        help="Exit non-zero if findings at this priority or higher are present.",
    )
    report_parser.add_argument("--tree-depth", type=int, default=3, help="Maximum depth in tree.summary.json.")
    report_parser.add_argument("--tree-top", type=int, default=6, help="Maximum children per tree level.")
    report_parser.add_argument("--include-tree", action="store_true", help="Also write/include the full raw tree.json artifact.")
    report_parser.add_argument(
        "--include-dependencies",
        action="store_true",
        help="Also write/include the TS/TSX dependency graph artifact.",
    )

    hotspots_parser = subparsers.add_parser("hotspots", help="Print ranked hotspots.")
    hotspots_parser.add_argument("path", nargs="?", help="Path to analyze. Defaults to the enclosing Git repo root.")
    hotspots_parser.add_argument(
        "--metric",
        choices=metric_catalog.RANKABLE_IDS,
        default="complexity",
        help="Metric to rank by, worst first (the explorer's Hot Spots list).",
    )
    hotspots_parser.add_argument("--limit", type=int, default=25, help="Maximum hotspots to print.")
    hotspots_parser.add_argument(
        "--cohort",
        choices=["file", "function"],
        default="file",
        help="Rank files against files, or functions against functions.",
    )
    hotspots_parser.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format.")

    explain_parser = subparsers.add_parser("explain", help="Print a focused report for one file or subtree.")
    explain_parser.add_argument("path", nargs="?", help="Path to analyze. Defaults to the enclosing Git repo root.")
    explain_parser.add_argument("--file", required=True, help="File path to explain.")
    explain_parser.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format.")

    compare_parser = subparsers.add_parser(
        "compare",
        help="Compare two git refs: changed files, metric deltas, and dependency edges.",
    )
    compare_parser.add_argument(
        "base",
        nargs="?",
        default="merge-base",
        help=(
            "Base ref. Defaults to merge-base (of the default branch and HEAD). "
            "pr:<n> means that PR's merge-base with its own base branch."
        ),
    )
    compare_parser.add_argument(
        "head",
        nargs="?",
        default=None,
        help=(
            "Head ref. Defaults to WORKTREE (files on disk, including uncommitted edits), "
            "or to pr:<n> when the base is pr:<n>. pr:<n> means that PR's head commit (read via gh)."
        ),
    )
    compare_parser.add_argument("--repo", default=None, help="Path inside the git repo. Defaults to the cwd.")
    compare_parser.add_argument("--json", action="store_true", help="Print the compare payload as JSON.")
    compare_parser.add_argument("--out", default=None, help="Write the JSON payload to this file.")
    compare_parser.add_argument(
        "--include-sides",
        action="store_true",
        help="Include both full trees and dependency graphs in the JSON.",
    )
    compare_parser.add_argument("--refresh", action="store_true", help="Rescan both sides instead of using the cache.")
    compare_parser.add_argument("--limit", type=int, default=40, help="Maximum files in the markdown summary.")

    args = parser.parse_args(argv)

    if args.command == "compare":
        _run_compare(args)
        return

    if args.command == "scan":
        if args.format != "json":
            raise SystemExit("--format jsonl is reserved and not implemented yet.")
        if args.include_source not in {"none", "false"}:
            raise SystemExit("--include-source snippets is reserved and not implemented yet.")
        target_path = _resolve_target_path(args.path)
        out_path = Path("-") if args.out == "-" else Path(args.out).resolve()
        reporting.write_scan(target_path, out_path, refresh=args.refresh)
        if str(args.out) != "-":
            print(f"Wrote Srcly tree JSON to {out_path}")
        return

    if args.command == "report":
        target_path = _resolve_target_path(args.path)
        if args.stdout:
            payload = reporting.build_report_payload(
                target_path,
                profile=args.profile,
                metric=args.metric,
                limit=args.limit,
                refresh=args.refresh,
                tree_depth=args.tree_depth,
                tree_top=args.tree_top,
                include_tree=args.include_tree,
                include_dependencies=args.include_dependencies,
                focus_paths=args.focus,
                deprioritize_paths=_deprioritize_paths(args),
                agent_compact=args.agent_compact,
                verbose=args.verbose,
                output_format=args.format,
            )
            print(reporting._json_dumps(payload))
        else:
            out_dir = Path(args.out).resolve()
            output_format = "both" if args.fail_on != "none" and args.format == "markdown" else args.format
            written = reporting.write_report(
                target_path,
                out_dir,
                profile=args.profile,
                metric=args.metric,
                limit=args.limit,
                output_format=output_format,
                refresh=args.refresh,
                tree_depth=args.tree_depth,
                tree_top=args.tree_top,
                include_tree=args.include_tree,
                include_dependencies=args.include_dependencies,
                focus_paths=args.focus,
                deprioritize_paths=_deprioritize_paths(args),
                agent_compact=args.agent_compact,
                verbose=args.verbose,
            )
            if args.verbose:
                print(f"Wrote Srcly report artifacts to {out_dir}")
                for path in written.values():
                    print(f"- {path}")
            else:
                print(_format_quiet_report_summary(out_dir, written))
        if args.fail_on != "none":
            if args.stdout:
                _enforce_fail_on_payload(payload["findings"], args.fail_on)
            else:
                _enforce_fail_on(out_dir / "findings.json", args.fail_on)
        return

    if args.command == "hotspots":
        target_path = _resolve_target_path(args.path)
        tree = reporting.scan_tree(target_path)
        result = reporting.rank_by_metric(tree, args.metric, cohort=args.cohort, root_path=target_path)
        result["ranked"] = result["ranked"][: args.limit]
        if args.format == "json":
            print(reporting._json_dumps(result))
        else:
            for item in result["ranked"]:
                location = item["path"]
                if item.get("start_line") and item.get("end_line"):
                    location = f"{location}:{item['start_line']}-{item['end_line']}"
                where = f" in {item['witness']['name']} (line {item['witness']['start_line']})" if item["witness"] else ""
                print(f"{item['rank']}. {item['value']} {item['unit']} {location}{where}")
            if result["na_count"]:
                print(f"({result['na_count']} N/A for {args.metric}, not ranked)")
        return

    if args.command == "explain":
        target_path = _resolve_target_path(args.path)
        tree = reporting.scan_tree(target_path)
        payload = _explain_file(tree, Path(args.file).resolve(), target_path)
        if args.format == "json":
            print(reporting._json_dumps(payload))
        else:
            print(_render_explain_markdown(payload))
        return


def _run_compare(args) -> None:
    from app.services.compare.git_refs import PR_REF, WORKTREE, GitError
    from app.services.compare.service import build_compare, render_markdown

    repo_path = Path(args.repo).resolve() if args.repo else Path(os.getcwd())
    # `srcly compare pr:42` alone means the whole PR.
    head = args.head or (args.base if PR_REF.match(args.base) else WORKTREE)
    try:
        payload = build_compare(
            repo_path,
            args.base,
            head,
            include_sides=args.include_sides,
            force=args.refresh,
            on_phase=lambda phase: print(f"srcly compare: {phase}", file=sys.stderr, flush=True),
        )
    except GitError as exc:
        raise SystemExit(str(exc)) from exc
    timings = payload.get("timings", {})
    for group in ("phases", "base", "head"):
        steps = timings.get(group) or {}
        if steps:
            text = ", ".join(f"{name} {seconds:.2f}s" for name, seconds in steps.items())
            print(f"srcly compare: {group} timings: {text}", file=sys.stderr, flush=True)
    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(reporting._json_dumps(payload), encoding="utf-8")
        print(f"Wrote compare payload to {out_path}", file=sys.stderr)
    if args.json:
        print(reporting._json_dumps(payload))
    elif not args.out:
        print(render_markdown(payload, limit=args.limit), end="")


def _deprioritize_paths(args) -> tuple[str, ...]:
    if args.no_default_deprioritize:
        return tuple(args.deprioritize or ())
    return tuple(reporting.DEFAULT_DEPRIORITIZED_PATHS) + tuple(args.deprioritize or ())


def _format_quiet_report_summary(out_dir: Path, written: dict[str, Path]) -> str:
    names = ", ".join(path.name for path in written.values())
    read_first = out_dir / "report.md"
    return f"Wrote {len(written)} Srcly artifacts to {out_dir}: {names}\nRead first: {read_first}"


def _enforce_fail_on(findings_path: Path, fail_on: str) -> None:
    import json

    data = json.loads(findings_path.read_text(encoding="utf-8"))
    _enforce_fail_on_payload(data, fail_on)


def _enforce_fail_on_payload(data: dict, fail_on: str) -> None:
    priorities = {"high": 2, "medium": 1, "low": 0}
    threshold = priorities[fail_on]
    offenders = [
        finding
        for finding in data.get("findings", [])
        if priorities.get(finding.get("priority", "low"), 0) >= threshold
    ]
    if offenders:
        raise SystemExit(f"Srcly found {len(offenders)} findings at priority {fail_on} or higher.")


def _explain_file(tree, file_path: Path, root_path: Path) -> dict:
    target = None
    for node in reporting.iter_nodes(tree):
        try:
            node_path = Path(node.path).resolve()
        except Exception:
            continue
        if node_path == file_path:
            target = node
            break

    if target is None:
        raise SystemExit(f"File not found in analysis tree: {file_path}")

    # Inside one file, rank its functions against each other.
    ranked = reporting.rank_nodes(target, cohort="function")
    return {
        "path": str(file_path),
        "summary": reporting.summarize_tree(target, ranked, root_path=root_path, max_depth=3, top_children=20),
        "hotspots": ranked[:10],
    }


def _render_explain_markdown(payload: dict) -> str:
    lines = [
        f"# Srcly Explain: {payload['path']}",
        "",
        "## Tree",
        "",
        "```text",
        *reporting.render_tree_lines(payload["summary"]),
        "```",
        "",
        "## Hotspots",
        "",
    ]
    for item in payload["hotspots"]:
        location = item["path"]
        if item.get("start_line") and item.get("end_line"):
            location = f"{location}:{item['start_line']}-{item['end_line']}"
        lines.append(f"- score={item['score']} `{location}`: {item['reason']}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
