"""
A stand-in for ``engine/bin/srcly-engine.ts`` that speaks the same stdio
protocol, so the engine lifecycle tests need no Node.

Flags (after the ``--root``/``--source`` the server always passes):
  --delay OP=SECONDS   answer OP after a pause (requests run on threads, so
                       replies arrive in completion order)
  --hang OP            never answer OP (a cancel still gets ``cancelled``)
  --ignore-cancel      do not answer cancels
  --crash OP           write to stderr and exit 3 when OP arrives
  --garbage OP         print a non-protocol line when OP arrives
  --protocol N         report protocol N in hello
  --refuse CODE        answer routes with that engine error code
"""

import argparse
import json
import sys
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument("--root", default="")
parser.add_argument("--source", default="")
parser.add_argument("--tsconfig", default=None)
parser.add_argument("--delay", action="append", default=[])
parser.add_argument("--hang", action="append", default=[])
parser.add_argument("--ignore-cancel", action="store_true")
parser.add_argument("--crash", action="append", default=[])
parser.add_argument("--garbage", action="append", default=[])
parser.add_argument("--protocol", type=int, default=1)
parser.add_argument("--refuse", default=None)
args = parser.parse_args()

delays = {op: float(seconds) for op, seconds in (item.split("=", 1) for item in args.delay)}
write_lock = threading.Lock()
hanging: set[int] = set()
cancelled: set[int] = set()
state = {"built": False, "generation": 0}


def send(frame: dict) -> None:
    with write_lock:
        sys.stdout.write(json.dumps(frame) + "\n")
        sys.stdout.flush()


def result_for(op: str, params: dict) -> dict:
    if op == "hello":
        return {"protocol": args.protocol, "engine": "fake", "node": "v0-fake", "typescript": "5.9.3",
                "typescriptFrom": "bundled", "root": args.root, "source": args.source}
    if op == "status":
        built = state["built"]
        return {"protocol": 1, "built": built, "generation": state["generation"] or None,
                "programHash": "hash-1" if built else None, "currentHash": "hash-1" if built else None,
                "stale": False, "rssBytes": 1234, "progress": None}
    if op == "routes":
        if not state["built"]:
            state["built"] = True
            state["generation"] = 1
        return {"outcome": "ok", "generation": state["generation"], "programHash": "hash-1",
                "tsconfig": f"{args.root}/tsconfig.json", "typescript": "5.9.3",
                "routes": [{"key": "route:records", "pathPattern": "/records", "file": "src/routes/records.tsx",
                            "absPath": f"{args.root}/src/routes/records.tsx", "parameters": []}]}
    raise LookupError(op)


def handle(frame: dict) -> None:
    request_id, op, params = frame["id"], frame["op"], frame.get("params") or {}
    if op in args.crash:
        sys.stderr.write(f"fake engine crashed on {op}\n")
        sys.stderr.flush()
        sys.exit(3)
    if op in args.garbage:
        with write_lock:
            sys.stdout.write("this is not a frame\n")
            sys.stdout.flush()
    if op in args.hang:
        hanging.add(request_id)
        return
    if op == "routes":
        send({"id": request_id, "progress": {"phase": "program", "message": "Building", "completed": 0, "total": 3}})
    if op in delays:
        time.sleep(delays[op])
    if request_id in cancelled:
        return
    if op == "routes" and args.refuse:
        send({"id": request_id, "ok": False, "error": {"code": args.refuse, "message": f"refused: {args.refuse}"}})
        return
    expected = params.get("expectedGeneration")
    if op == "routes" and expected is not None and state["generation"] and expected != state["generation"]:
        send({"id": request_id, "ok": False, "error": {"code": "stale-generation", "message": "stale",
                                                     "details": {"generation": state["generation"], "programHash": "hash-1"}}})
        return
    try:
        send({"id": request_id, "ok": True, "result": result_for(op, params)})
    except LookupError:
        send({"id": request_id, "ok": False, "error": {"code": "invalid-request", "message": f"Unknown op: {op}"}})


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    frame = json.loads(line)
    if frame.get("op") == "cancel":
        target = frame["params"]["id"]
        if not args.ignore_cancel:
            cancelled.add(target)
            hanging.discard(target)
            send({"id": target, "ok": False, "error": {"code": "cancelled", "message": "Analysis request was cancelled"}})
        continue
    if frame.get("op") in args.crash:
        handle(frame)
    threading.Thread(target=handle, args=(frame,), daemon=True).start()

sys.exit(0)
