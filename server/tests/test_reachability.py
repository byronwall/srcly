from pathlib import Path

from app.services.findings.reachability import analyze


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_reachability_follows_imports_and_config_strings(tmp_path: Path) -> None:
    app = tmp_path.resolve() / "app"
    _write(app / "package.json", '{"name": "app", "scripts": {"seed": "tsx tools/seed.ts"}}')
    _write(app / "vite.config.ts", 'export default { routes: { "/ws/jobs": "./src/ws/jobs.ts" } };\n')
    _write(
        app / "vitest.config.ts",
        'import { resolve } from "path";\nexport default { alias: { "server-only": resolve(__dirname, "src/test/server-only.ts") } };\n',
    )
    _write(app / "src" / "routes" / "index.tsx", 'import { format, forBoth } from "../lib/barrel";\nimport { other } from "../lib/b";\nimport { kept } from "../lib/c";\nexport default () => format(other, forBoth + kept);\n')
    _write(app / "src" / "lib" / "barrel.ts", 'export * from "./a";\nexport { passed } from "./c";\n')
    # Only the barrel names `passed`: dropping its `export` would break the barrel.
    _write(app / "src" / "lib" / "c.ts", "export const passed = 1;\nexport const kept = passed;\n")
    _write(
        app / "src" / "lib" / "a.ts",
        "export function format(a: number, b: number) { return a + b + local; }\n"
        "export const local = 1;\n"
        "export const forTests = 2;\n"
        "export const forBoth = 3;\n",
    )
    # Shares the name `format` with a.ts; only a.ts's is imported.
    _write(app / "src" / "lib" / "b.ts", "export const other = 1;\nexport function format() {}\n")
    _write(app / "src" / "lib" / "a.test.ts", 'import { forTests, forBoth } from "./a";\nforTests + forBoth;\n')
    _write(app / "src" / "lib" / "dead.ts", "export const dead = 1;\n")
    _write(app / "src" / "ws" / "jobs.ts", "export default {};\n")
    _write(app / "src" / "test" / "server-only.ts", "export {};\n")
    _write(app / "tools" / "seed.ts", "export {};\n")

    got = {(Path(f.path).relative_to(app).as_posix(), f.rule, f.line) for f in analyze(tmp_path)}

    assert got == {
        ("src/lib/dead.ts", "unreachable-file", 1),
        ("src/lib/a.ts", "export-used-in-file-only", 2),
        ("src/lib/a.ts", "test-only-export", 3),
        ("src/lib/b.ts", "unused-export", 2),
        ("src/lib/c.ts", "unused-export", 1),
    }


def test_no_entries_means_not_analyzed(tmp_path: Path) -> None:
    _write(tmp_path / "lib" / "a.ts", "export const a = 1;\n")
    assert analyze(tmp_path) is None
