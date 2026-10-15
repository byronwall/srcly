"""
Module-level analyze functions for scan worker tests.

Worker processes are started with the "spawn" method, so the function they run
must be importable by name from a fresh interpreter (no closures or lambdas).
Behavior is keyed off the file name.
"""

import os
import signal
import time
from pathlib import Path


def fake_analyze(path: str):
    name = Path(path).name
    if name.startswith("hang"):
        time.sleep(60)
    if name.startswith("crash"):
        os._exit(3)
    if name.startswith("error"):
        return {"error": "boom", "filename": path}
    if name.startswith("sigint"):
        return {"sigint_ignored": signal.getsignal(signal.SIGINT) == signal.SIG_IGN, "filename": path}
    if name.startswith("slow"):
        time.sleep(0.3)
    return {"pid": os.getpid(), "filename": path}
