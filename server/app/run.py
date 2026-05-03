import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from app.services import reporting


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
    """
    Entry point for the CLI.

    - With no path argument, uses the enclosing Git repo root as the codebase root.
    - If a path is provided (including "."), uses that as the codebase root.
    - Starts the FastAPI server.
    - Opens the default browser to the app URL.
    """
    argv = list(argv) if argv is not None else sys.argv[1:]
    if argv and argv[0] in {"scan", "report", "hotspots", "explain"}:
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
        "--profile",
        choices=["general", "frontend", "backend", "typescript", "python", "docs"],
        default="general",
        help="Scoring profile.",
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
    hotspots_parser.add_argument("--metric", action="append", default=None, help="Metric to score. May be repeated.")
    hotspots_parser.add_argument("--limit", type=int, default=25, help="Maximum hotspots to print.")
    hotspots_parser.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format.")

    explain_parser = subparsers.add_parser("explain", help="Print a focused report for one file or subtree.")
    explain_parser.add_argument("path", nargs="?", help="Path to analyze. Defaults to the enclosing Git repo root.")
    explain_parser.add_argument("--file", required=True, help="File path to explain.")
    explain_parser.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format.")

    args = parser.parse_args(argv)

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
                limit=args.limit,
                refresh=args.refresh,
                tree_depth=args.tree_depth,
                tree_top=args.tree_top,
                include_tree=args.include_tree,
                include_dependencies=args.include_dependencies,
            )
            print(reporting._json_dumps(payload))
        else:
            out_dir = Path(args.out).resolve()
            output_format = "both" if args.fail_on != "none" and args.format == "markdown" else args.format
            written = reporting.write_report(
                target_path,
                out_dir,
                profile=args.profile,
                limit=args.limit,
                output_format=output_format,
                refresh=args.refresh,
                tree_depth=args.tree_depth,
                tree_top=args.tree_top,
                include_tree=args.include_tree,
                include_dependencies=args.include_dependencies,
            )
            print(f"Wrote Srcly report artifacts to {out_dir}")
            for path in written.values():
                print(f"- {path}")
        if args.fail_on != "none":
            if args.stdout:
                _enforce_fail_on_payload(payload["findings"], args.fail_on)
            else:
                _enforce_fail_on(out_dir / "findings.json", args.fail_on)
        return

    if args.command == "hotspots":
        target_path = _resolve_target_path(args.path)
        tree = reporting.scan_tree(target_path)
        profile = _profile_from_metrics(args.metric)
        ranked = reporting.rank_nodes(tree, profile=profile)[: args.limit]
        if args.format == "json":
            print(reporting._json_dumps({"rankings": ranked}))
        else:
            for item in ranked:
                location = item["path"]
                if item.get("start_line") and item.get("end_line"):
                    location = f"{location}:{item['start_line']}-{item['end_line']}"
                print(f"{item['rank']}. score={item['score']} {location} - {item['reason']}")
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


def _profile_from_metrics(metrics: list[str] | None) -> str:
    if not metrics:
        return "general"
    weights = {metric: 1.0 for metric in metrics}
    reporting.PROFILE_WEIGHTS["_custom"] = weights
    return "_custom"


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

    ranked = reporting.rank_nodes(target)
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
