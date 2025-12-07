import argparse
import os
import socket
import threading
import time
import webbrowser

import uvicorn


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


if __name__ == "__main__":
    main()
