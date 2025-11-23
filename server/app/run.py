import argparse
import os
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


def main(argv: list[str] | None = None) -> None:
    """
    Entry point for the CLI.

    - Uses the current working directory (or a provided path) as the codebase root.
    - Starts the FastAPI server.
    - Opens the default browser to the app URL.
    """
    parser = argparse.ArgumentParser(
        prog="srcly",
        description=(
            "Interactive codebase treemap and metrics viewer. "
            "By default, analyzes the current working directory."
        ),
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Path to the codebase to analyze (default: current directory).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind the server to (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to run the server on (default: 8000).",
    )

    args = parser.parse_args(argv)

    target_path = os.path.abspath(args.path)
    if not os.path.exists(target_path):
        raise SystemExit(f"Path does not exist: {target_path}")

    # Change working directory so the API defaults to this path.
    os.chdir(target_path)
    print(f"📂 Analyzing codebase at: {target_path}")

    url = f"http://{args.host}:{args.port}"
    print(f"🚀 Starting server at {url}")
    print("   Press Ctrl+C to stop.")

    _open_browser_later(url)

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
