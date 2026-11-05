"""Headless DSL → diagnostics → codemod → execution, shared with the app."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.refactor import compiler, runs
from app.services.refactor.catalog import catalog
from app.services.refactor.plan import RefactorError, parse, safe_path


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="srcly refactor", description="Compile deterministic refactoring plans and execute their recorded codemods. All results are JSON.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("catalog", help="List supported DSL operations and preconditions.")
    project = commands.add_parser("project", help="Inspect targets and compiler diagnostics.")
    project.add_argument("--path", default=".")
    project.add_argument("--config", default="tsconfig.json")
    for name in ("parse", "preview"):
        command = commands.add_parser(name)
        command.add_argument("plan", type=Path)
        command.add_argument("--path", default=".")
    for name in ("show", "codemod", "apply", "undo"):
        command = commands.add_parser(name)
        command.add_argument("run")
        if name == "apply":
            command.add_argument("--all", action="store_true", help="Apply the whole validated remainder; default applies the next step.")
    args = parser.parse_args(argv)
    try:
        if args.command == "catalog":
            result = catalog()
        elif args.command == "project":
            result = compiler.inspect(Path(args.path).resolve(), safe_path(args.config))
        elif args.command in {"parse", "preview"}:
            source = args.plan.read_text()
            result = parse(source) if args.command == "parse" else runs.preview(Path(args.path), source)
        elif args.command in {"apply", "undo"}:
            result = runs.execute(args.run, "undo" if args.command == "undo" else "all" if args.all else "next")
        else:
            with runs.locked(args.run):
                run = runs.load(args.run)
                result = runs.codemod(run) if args.command == "codemod" else runs.public(run)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if result.get("status") == "blocked":
            raise SystemExit(2)
    except (ValueError, OSError, RuntimeError) as exc:
        diagnostic = exc.diagnostic if isinstance(exc, RefactorError) else {"code": "execution-error", "message": str(exc), "line": None}
        print(json.dumps({"status": "blocked", "diagnostics": [diagnostic]}, indent=2))
        raise SystemExit(2) from exc
