"""The Change Lens acceptance repo (issue #397, "Small acceptance fixture").

``build(folder)`` makes a git repo with a ``main`` commit and a ``feature``
branch whose commits hold each case the contract names. Dates, names and
contents are fixed, so the commit shas are the same on every machine.

    uv run python -m tests.fixtures.change_lens_repo <dir>
    uv run python -m tests.fixtures.change_lens_repo <dir> --write-payloads ../client/src/changelens

The second form also writes ``fixture.json`` (touched) and ``fixture.net.json``
(net): the payloads the engine returns for this repo, which the client tests read.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

AUTHOR = "Fixture Author"
EMAIL = "fixture@example.com"

FILLERS = "".join(
    f"""
export function step{n:02d}(input: number) {{
  const scaled = input * {n};
  if (scaled > 100) {{
    return scaled - 100;
  }}
  return scaled;
}}
"""
    for n in range(1, 15)
)

PARSE_ARGS_V0 = """export function parseArgs(argv: string[]) {
  const args = { verbose: false, limit: 10 };
  for (const arg of argv) {
    if (arg === "--verbose") args.verbose = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
  }
  return args;
}
"""

PARSE_ARGS_V1 = """export function parseArgs(argv: string[]) {
  const args = { verbose: false, limit: 10, dryRun: false };
  for (const arg of argv) {
    if (arg === "--verbose") args.verbose = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
  }
  return args;
}
"""

RETRY_V0 = """export async function retryJob(job: Job, max: number) {
  while (job.attempts < max) {
    try {
      await job.run();
      return true;
    } catch (err) {
      job.attempts += 1;
      if (err instanceof TypeError) throw err;
      if (job.attempts >= max) break;
    }
  }
  return false;
}
"""

RETRY_V1 = """export async function retryJob(job: Job, max: number) {
  while (job.attempts < max) {
    try {
      await job.run();
      return true;
    } catch (err) {
      job.attempts += 1;
      if (err instanceof TypeError) throw err;
      if (job.attempts >= max) break;
      const delay = job.attempts > 3 ? 400 : 100;
      await sleep(delay);
    }
  }
  return false;
}
"""

RETRY_V2 = RETRY_V1.replace(
    "  while (job.attempts < max) {\n",
    "  if (max > 20) max = 20;\n  while (job.attempts < max) {\n",
)

RETRY_V3 = RETRY_V2.replace(
    "      await sleep(delay);\n",
    "      const jitter = job.id.length % 2 === 0 ? 10 : job.id.length % 3 === 0 ? 20 : 0;\n"
    "      if (delay + jitter > 400 && job.attempts < 10) continue;\n"
    "      await sleep(delay + jitter);\n",
)

WORKER_HEAD = """export interface Job {
  id: string;
  attempts: number;
  run: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

"""

FORMAT_LOG_V0 = """export function formatLog(job: Job, ok: boolean) {
  return `${job.id}: ${ok ? "done" : "failed"}`;
}
"""

FORMAT_LOG_WORKTREE = """export function formatLog(job: Job, ok: boolean) {
  const attempts = job.attempts === 1 ? "1 attempt" : `${job.attempts} attempts`;
  return `${job.id}: ${ok ? "done" : "failed"} after ${attempts}`;
}
"""

LEGACY = """export function legacyCleanup(jobs: Job[]) {
  for (const job of jobs) {
    if (job.attempts > 100) job.attempts = 0;
  }
  return jobs.length;
}

"""


def worker(parse_args: str, retry: str, format_log: str = FORMAT_LOG_V0, legacy: str = LEGACY) -> str:
    return WORKER_HEAD + parse_args + "\n" + retry + "\n" + legacy + format_log + FILLERS


STRINGS = """export function titleCase(text: string) {
  return text
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}
"""

SCHEDULER_V0 = """import type { Job } from "./worker";

export function pickNext(queue: Job[]) {
  for (const job of queue) {
    if (job.attempts === 0) return job;
  }
  return queue[0];
}

export function isIdle(queue: Job[]) {
  return queue.length === 0;
}
"""

SCHEDULER_V1 = SCHEDULER_V0.replace(
    """  for (const job of queue) {
    if (job.attempts === 0) return job;
  }
  return queue[0];
""",
    """  const sorted = [...queue].sort((a, b) => a.attempts - b.attempts);
  if (sorted.length > 1 && sorted[0].attempts === sorted[1].attempts) {
    return sorted[0].id < sorted[1].id ? sorted[0] : sorted[1];
  }
  return sorted[0];
""",
)

ROUTER_V0 = """export function dispatch(kind: string, size: number) {
  if (kind === "email") return size > 10 ? "bulk-mail" : "mail";
  if (kind === "sms") return size > 5 ? "bulk-sms" : "sms";
  if (kind === "push") return "push";
  if (kind === "webhook") {
    if (size > 100) return "webhook-batch";
    return "webhook";
  }
  if (kind === "export" || kind === "report") return "slow";
  if (kind === "cleanup") return "idle";
  return "default";
}
"""

ROUTER_V1 = ROUTER_V0.replace(
    '  if (kind === "cleanup") return "idle";\n',
    '  if (kind === "cleanup") return "idle";\n  if (kind === "audit") return size > 50 ? "slow" : "default";\n',
)

PLANNER = """export interface Stop {
  id: string;
  open: boolean;
  load: number;
  urgent: boolean;
}

export function planRoute(stops: Stop[], capacity: number) {
  const route: string[] = [];
  let load = 0;
  for (const stop of stops) {
    if (!stop.open) continue;
    if (stop.urgent && load + stop.load > capacity) {
      route.unshift(stop.id);
      continue;
    }
    if (load + stop.load > capacity) {
      if (route.length === 0) break;
      load = 0;
    }
    if (stop.load > 0 || stop.urgent) {
      route.push(stop.id);
      load += stop.load;
    } else if (route.length > 3 && !stop.urgent) {
      route.pop();
    }
  }
  return route.length > 0 ? route : null;
}
"""

README_V0 = """# Worker

Runs queued jobs.

## Install

Run `pnpm install`.

## Usage

Run `pnpm start` with a queue file.
"""

README_V1 = README_V0.replace("Run `pnpm install`.", "Run `pnpm install`, then `pnpm build`.")

SETTINGS_V0 = """queue:
  limit: 10
  retries: 3
log:
  level: info
"""

SETTINGS_V1 = SETTINGS_V0.replace("retries: 3", "retries: 5")

# (subject, date, {path: content or None to delete}, [(old, new) renames])
COMMITS: list[tuple[str, str, dict, list]] = [
    ("retry: back off between attempts", "2026-01-06T10:00:00+00:00", {"src/worker.ts": worker(PARSE_ARGS_V0, RETRY_V1)}, []),
    ("retry: cap the attempt limit", "2026-01-06T11:00:00+00:00", {"src/worker.ts": worker(PARSE_ARGS_V0, RETRY_V2)}, []),
    ("scheduler: try a sorted pick", "2026-01-06T12:00:00+00:00", {"src/scheduler.ts": SCHEDULER_V1}, []),
    ("rename strings to text", "2026-01-06T13:00:00+00:00", {}, [("src/util/strings.ts", "src/util/text.ts")]),
    ("worker: remove legacyCleanup", "2026-01-06T14:00:00+00:00", {"src/worker.ts": worker(PARSE_ARGS_V0, RETRY_V2, legacy="")}, []),
    ("docs: build step, more retries", "2026-01-06T15:00:00+00:00", {"README.md": README_V1, "config/settings.yaml": SETTINGS_V1}, []),
    ("scheduler: back to the first idle job", "2026-01-06T16:00:00+00:00", {"src/scheduler.ts": SCHEDULER_V0}, []),
    ("args: accept --dry-run", "2026-01-06T17:00:00+00:00", {"src/worker.ts": worker(PARSE_ARGS_V1, RETRY_V2, legacy="")}, []),
    ("retry: add jitter", "2026-01-06T18:00:00+00:00", {"src/worker.ts": worker(PARSE_ARGS_V1, RETRY_V3, legacy="")}, []),
    ("planner: route stops; router: audit jobs", "2026-01-06T19:00:00+00:00", {"src/planner.ts": PLANNER, "src/router.ts": ROUTER_V1}, []),
]

BASE_FILES = {
    "src/worker.ts": worker(PARSE_ARGS_V0, RETRY_V0),
    "src/util/strings.ts": STRINGS,
    "src/scheduler.ts": SCHEDULER_V0,
    "src/router.ts": ROUTER_V0,
    "README.md": README_V0,
    "config/settings.yaml": SETTINGS_V0,
}
BASE_DATE = "2026-01-05T09:00:00+00:00"

# Left uncommitted on the feature branch.
WORKTREE_FILES = {"src/worker.ts": worker(PARSE_ARGS_V1, RETRY_V3, format_log=FORMAT_LOG_WORKTREE, legacy="")}


def _git(repo: Path, *args: str, date: str | None = None) -> str:
    # A clean environment: no GIT_DIR from a hook, no user or system config.
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_AUTHOR_NAME=AUTHOR, GIT_AUTHOR_EMAIL=EMAIL)
    env.update(GIT_COMMITTER_NAME=AUTHOR, GIT_COMMITTER_EMAIL=EMAIL)
    if date:
        env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
    proc = subprocess.run(["git", *args], cwd=repo, env=env, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def _write(repo: Path, files: dict) -> None:
    for rel, content in files.items():
        target = repo / rel
        if content is None:
            target.unlink()
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def build(folder: Path, *, worktree_edit: bool = True) -> Path:
    """Build the repo in ``folder`` (created; must be empty) and return it, on ``feature``."""
    repo = Path(folder)
    repo.mkdir(parents=True, exist_ok=True)
    if any(repo.iterdir()):
        raise RuntimeError(f"{repo} is not empty")
    repo = repo.resolve()
    _git(repo, "init", "--quiet", "--initial-branch=main")
    _write(repo, BASE_FILES)
    _git(repo, "add", "-A")
    _git(repo, "commit", "--quiet", "-m", "worker, scheduler and router", date=BASE_DATE)
    _git(repo, "checkout", "--quiet", "-b", "feature")
    for subject, date, files, renames in COMMITS:
        for old, new in renames:
            _git(repo, "mv", old, new)
        _write(repo, files)
        _git(repo, "add", "-A")
        _git(repo, "commit", "--quiet", "-m", subject, date=date)
    if worktree_edit:
        _write(repo, WORKTREE_FILES)
    return repo


def write_payloads(repo: Path, out_dir: Path) -> None:
    """Write the engine's touched and net payloads for the fixture repo, with a fixed repo root and time zone."""
    os.environ["TZ"] = "UTC"
    from app.services.changelens import service
    from app.services.changelens.window import Params

    for mode, name in (("touched", "fixture.json"), ("net", "fixture.net.json")):
        payload = service.build_payload(repo, Params(window="branch", mode=mode))
        payload["selection"]["repoRoot"] = "/repo/change-lens-fixture"
        (out_dir / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    built = build(Path(args[0]))
    print(built)
    if len(args) == 3 and args[1] == "--write-payloads":
        write_payloads(built, Path(args[2]))
        print(f"Wrote fixture.json and fixture.net.json to {args[2]}")
