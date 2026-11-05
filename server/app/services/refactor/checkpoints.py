"""Named argv checks from a versioned config, run without a shell in the owned worktree."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from app.services.refactor.plan import RefactorError
from app.services.compare.git_refs import repo_root


def resolve(root: Path, name: str) -> list[str]:
    file = root / ".srcly-refactor.json"
    if not file.is_file() or file.is_symlink():
        raise RefactorError("Define named checks in a tracked .srcly-refactor.json: {\"checks\": {\"unit\": [\"pnpm\", \"test\"]}}", code="checkpoint-config-required")
    try:
        argv = json.loads(file.read_text())["checks"][name]
    except (KeyError, TypeError, ValueError) as exc:
        raise RefactorError(f"Unknown or invalid checkpoint {name} in .srcly-refactor.json.", code="checkpoint-unknown") from exc
    if not isinstance(argv, list) or not argv or len(argv) > 100 or any(not isinstance(arg, str) or not arg or len(arg) > 4096 for arg in argv):
        raise RefactorError("A named check must be a nonempty argv array of strings; shell command strings are not accepted.", code="checkpoint-invalid")
    return argv


def run(root: Path, name: str, argv: list[str], timeout: int = 120) -> dict:
    from app.services.refactor.runs import fingerprint

    worktree = repo_root(root)
    before = fingerprint(worktree)
    started = time.monotonic()
    with tempfile.TemporaryFile() as output:
        process = subprocess.Popen(argv, cwd=root, stdout=output, stderr=subprocess.STDOUT, start_new_session=os.name != "nt",
                                   env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        timed_out = False
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        output.seek(0)
        text = output.read(100_001).decode("utf-8", errors="replace")
    result = {"name": name, "argv": argv, "exitCode": process.returncode, "seconds": round(time.monotonic() - started, 3),
              "output": text[:100_000], "truncated": len(text) > 100_000, "status": "passed"}
    changed = fingerprint(worktree) != before
    if changed or timed_out or process.returncode:
        result["status"] = "changed-files" if changed else "timeout" if timed_out else "failed"
        error = RefactorError(f"Checkpoint {name}: {result['status']}. {text[:1000]}", code="checkpoint-" + result["status"])
        error.diagnostic["checkpoint"] = result
        raise error
    return result
