import subprocess
from pathlib import Path

import pytest

from app.services.findings import fixes

TSC = Path(__file__).resolve().parents[2] / "client" / "node_modules" / ".bin" / "tsc"

FILES = {
    "tsconfig.json": '{"compilerOptions": {"strict": true, "noEmit": true, "baseUrl": ".", "paths": {"solid-js": ["src/solid-stub.ts"]}}, "include": ["src"]}',
    "src/solid-stub.ts": (
        "export function onMount(fn: () => void): void { fn(); }\n"
        "export function createEffect(fn: () => void): void { fn(); }\n"
        "export function onCleanup(fn: () => void): void { fn(); }\n"
    ),
    "src/routes/index.ts": 'import { helper, mount } from "../lib/a";\nexport default () => helper() + mount();\n',
    "src/lib/a.ts": (
        'import { createEffect, onMount } from "solid-js";\n'
        "export function inner() { return 1; }\n"
        "export const helper = () => inner();\n"
        "export function mount() {\n"
        "  onMount(() => {\n"
        "    const t = setTimeout(() => {}, 10);\n"
        "    return () => clearTimeout(t);\n"
        "  });\n"
        "  createEffect(() => {\n"
        "    return function stop() {};\n"
        "  });\n"
        "  return 1;\n"
        "}\n"
    ),
    "src/lib/dead.ts": "export const dead = 1;\n",
}


def _tsc(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run([str(TSC), "-p", str(root)], capture_output=True, text=True)


@pytest.mark.skipif(not TSC.exists(), reason="needs client/node_modules (pnpm install in client/)")
def test_fixes_keep_tsc_passing(tmp_path: Path) -> None:
    root = tmp_path.resolve()
    for rel, text in FILES.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    assert _tsc(root).returncode == 0

    dry = fixes.run(root)
    assert "Would apply 3 fixes in 1 files." in dry
    assert (root / "src/lib/a.ts").read_text() == FILES["src/lib/a.ts"]

    fixes.run(root, apply=True)
    # Deleting files needs its rule named.
    assert (root / "src/lib/dead.ts").exists()
    fixes.run(root, {"unreachable-file"}, apply=True)
    assert not (root / "src/lib/dead.ts").exists()

    out = _tsc(root)
    assert out.returncode == 0, out.stdout
    a = (root / "src/lib/a.ts").read_text()
    assert a.startswith('import { createEffect, onMount, onCleanup } from "solid-js";\nfunction inner()')
    assert "    onCleanup(() => clearTimeout(t));\n" in a
    assert "    onCleanup(function stop() {});\n" in a
