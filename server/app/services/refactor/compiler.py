from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path

from app.services.dataflow.availability import locate_bundle, locate_node
from app.services.refactor.plan import RefactorError

_compiler_lock = threading.Lock()


def inspect(root: Path, config: str, action: dict | None = None) -> dict:
    node = locate_node()
    launch = locate_bundle(node) if node else None
    if not launch:
        raise RefactorError("The refactoring compiler needs Node 18+ and the srcly engine bundle.")
    entry = Path(launch.argv[-1]).with_name("srcly-refactor.ts" if launch.kind == "dev" else "srcly-refactor.mjs")
    if not entry.is_file():
        raise RefactorError("The refactoring compiler is missing; rebuild srcly's engine bundle.")
    argv = [launch.argv[0], "--max-old-space-size=4096", *launch.argv[1:-1], str(entry)]
    try:
        with _compiler_lock:
            result = subprocess.run(argv, cwd=launch.cwd, input=json.dumps({"root": str(root), "config": config, "action": action}),
                                    text=True, capture_output=True, timeout=120)
        payload = json.loads(result.stdout)
        if result.returncode or "error" in payload:
            raise RefactorError(payload.get("error", "The refactoring compiler failed."), code="compiler-refused")
        return payload
    except subprocess.TimeoutExpired as exc:
        raise RefactorError("The refactoring compiler exceeded 120 seconds.") from exc
    except (OSError, ValueError) as exc:
        if isinstance(exc, RefactorError):
            raise
        raise RefactorError(f"The refactoring compiler could not run: {exc}") from exc
