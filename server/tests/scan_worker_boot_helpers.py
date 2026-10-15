"""
Analyze functions whose *import* misbehaves inside worker processes.

Spawned workers unpickle ``analyze_fn`` by importing this module, so module
level code here runs during worker startup. Tests set ``SRCLY_TEST_BOOT`` with
monkeypatch; the pytest process imported this module at collection time, before
the variable existed, so only workers see it.
"""

import os
import time
from pathlib import Path

if os.environ.get("SRCLY_TEST_BOOT") == "slow":
    time.sleep(0.6)
if os.environ.get("SRCLY_TEST_BOOT") == "broken":
    os._exit(7)


def fake_boot_analyze(path: str):
    if Path(path).name.startswith("hang"):
        time.sleep(60)
    return {"filename": path}
