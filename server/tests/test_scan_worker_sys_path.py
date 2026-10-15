"""
Scan workers must boot no matter how the server was launched.

``python -m uvicorn`` sets sys.argv[0] to ``uvicorn/__main__.py``. lizard puts
that directory on sys.path when imported, and spawned workers inherit sys.path,
so uvicorn's ``logging.py`` used to shadow the stdlib and every worker died
during startup. The scan runs in a subprocess because it changes sys.argv and
imports ``app.services.analysis`` fresh.
"""

import json
import subprocess
import sys
import textwrap
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]

SCRIPT = textwrap.dedent(
    """
    import json, logging, sys
    fake_main, target = sys.argv[1], sys.argv[2]
    sys.argv = [fake_main]

    from app.services import analysis
    from app.services.scan_workers import run_file_analyses

    outcome = run_file_analyses([target], timeout_seconds=30, max_workers=1)
    print(json.dumps({
        "sys_path": sys.path,
        "result_count": len(outcome.results),
        "failures": [f.reason for f in outcome.failures],
    }))
    """
)


def test_workers_boot_when_argv0_is_inside_a_package_with_logging_py(tmp_path: Path) -> None:
    package = tmp_path / "fakeserver"
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "__main__.py").write_text("")
    # Mirrors uvicorn/logging.py: a module that needs the real logging module.
    (package / "logging.py").write_text("import logging\nclass F(logging.Formatter):\n    pass\n")
    target = tmp_path / "sample.py"
    target.write_text("def f(x):\n    return x\n")

    proc = subprocess.run(
        [sys.executable, "-c", SCRIPT, str(package / "__main__.py"), str(target)],
        cwd=SERVER_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert proc.returncode == 0, proc.stderr
    report = json.loads(proc.stdout.strip().splitlines()[-1])
    assert str(package) not in report["sys_path"]
    assert report["failures"] == []
    assert report["result_count"] == 1
