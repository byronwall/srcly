"""
A stand-in for ``engine/bin/srcly-engine.ts`` that speaks the same stdio
protocol, so the engine lifecycle and router tests need no Node.

Every reply is built from the engine's emitted JSON Schemas
(``app/services/dataflow/contracts/*.schema.json``): ``example()`` fills the
required fields of a schema with its first enum value, zero, the empty
string or null, and the scenarios below overlay only the fields a test reads.
If the schemas change, the fake changes with them, and
``tests/test_dataflow_outcomes.py`` validates every reply against its schema.

Flags (after the ``--root``/``--source`` the server always passes):
  --delay OP=SECONDS   answer OP after a pause (requests run on threads, so
                       replies arrive in completion order)
  --hang OP            never answer OP (a cancel still gets ``cancelled``)
  --ignore-cancel      do not answer cancels
  --crash OP           write to stderr and exit 3 when OP arrives
  --garbage OP         print a non-protocol line when OP arrives
  --protocol N         report protocol N in hello
  --refuse CODE        answer routes with that engine error code
  --outcome OP=SHAPE   answer OP in that shape: ok (default), partial,
                       unsupported, budget, stale or not-analyzed
  --stale              report the built generation as stale (its sources
                       changed) until a refresh rebuilds it
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from pathlib import Path
from typing import Any

CONTRACTS = Path(__file__).resolve().parents[1] / "app" / "services" / "dataflow" / "contracts"
OPS = ("hello", "status", "routes", "routeGraph", "selectExpression", "valueFlow", "anchorGraph", "functionEffects", "routePath", "fileExports")
SHAPES = ("ok", "partial", "unsupported", "budget", "stale", "not-analyzed")
"""Shapes the three graph ops answer in; the other three are engine errors."""
RESULT_SHAPES = ("ok", "partial", "unsupported")


def schema_for(op: str) -> dict:
    return json.loads((CONTRACTS / f"{op}.schema.json").read_text(encoding="utf-8"))


def example(schema: dict) -> Any:
    """The smallest instance of a schema: required fields only, first choices."""
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    if "anyOf" in schema:
        options = schema["anyOf"]
        # A nullable field is null; otherwise the first option.
        if any(option.get("type") == "null" for option in options):
            return None
        return example(options[0])
    kind = schema.get("type")
    if isinstance(kind, list):
        if "null" in kind:
            return None
        kind = kind[0]
    if kind == "object":
        return {name: example(schema["properties"][name]) for name in schema.get("required", [])}
    if kind == "array":
        return []
    if kind == "string":
        return ""
    if kind == "integer":
        low = schema.get("minimum", schema.get("exclusiveMinimum", -1) + 1)
        return max(low, 0) if "exclusiveMinimum" not in schema else max(low, schema["exclusiveMinimum"] + 1)
    if kind == "number":
        return 0
    if kind == "boolean":
        return False
    return None


def item_schema(schema: dict, *path: str) -> dict:
    """The schema at ``properties.a.items.properties.b…`` (``items`` steps are implied for arrays)."""
    node = schema
    for step in path:
        node = node["properties"][step]
        if node.get("type") == "array":
            node = node["items"]
    return node


class FakeEngine:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.state = {"built": False, "generation": 0, "stale": args.stale}
        self.outcomes = {op: shape for op, shape in (item.split("=", 1) for item in args.outcome)}
        for op, shape in self.outcomes.items():
            if shape not in SHAPES:
                raise SystemExit(f"--outcome {op}={shape}: shape must be one of {', '.join(SHAPES)}")

    # ---- results ------------------------------------------------------------

    def hash(self) -> str:
        return f"hash-{self.state['generation'] or 1}"

    def generation_fields(self) -> dict:
        return {"generation": self.state["generation"] or 1, "programHash": self.hash(),
                "tsconfig": f"{self.args.root}/tsconfig.json", "typescript": "5.9.3"}

    def result_for(self, op: str, params: dict) -> dict:
        if op == "hello":
            return {**example(schema_for("hello")), "protocol": self.args.protocol, "engine": "fake", "node": "v0-fake",
                    "typescript": "5.9.3", "typescriptFrom": "bundled", "root": self.args.root, "source": self.args.source}
        if op == "status":
            built = self.state["built"]
            stale = built and self.state["stale"]
            return {**example(schema_for("status")), "protocol": 1, "built": built, "generation": self.state["generation"] or None,
                    "programHash": self.hash() if built else None, "currentHash": ("hash-next" if stale else self.hash()) if built else None,
                    "stale": stale, "rssBytes": 1234, "progress": None}
        if op == "routes":
            if not self.state["built"]:
                self.state["built"] = True
                self.state["generation"] = 1
            return {**example(schema_for("routes")), "outcome": "ok", **self.generation_fields(), "routes": [self.route()]}
        if op == "refresh":
            # A new generation from the sources as they are now; the old one is stale from here on.
            self.state["built"] = True
            self.state["generation"] = (self.state["generation"] or 0) + 1
            self.state["stale"] = False
            return {**example(schema_for("routes")), "outcome": "ok", **self.generation_fields(), "routes": [self.route()]}
        if op == "routeGraph":
            return self.route_graph(params, self.outcomes.get(op, "ok"))
        if op == "routeSurface":
            # The backbone alone: the complete graph's boxes with nothing from the slice.
            graph = self.route_graph(params, "ok")
            return {**graph, "phase": "surface", "outcome": "partial", "status": "partial", "origins": [], "gaps": [],
                    "nodes": [{**graph["nodes"][0], "status": "partial", "reason": "evidence-pending"}, *graph["nodes"][1:]]}
        if op == "anchorGraph":
            return self.anchor_graph(params, self.outcomes.get(op, "ok"))
        if op == "valueFlow":
            return self.value_flow(params, self.outcomes.get(op, "ok"))
        if op == "selectExpression":
            return self.select_expression(params)
        if op == "functionEffects":
            return self.function_effects(params, self.outcomes.get(op, "ok"))
        if op == "routePath":
            return self.route_path(params, self.outcomes.get(op, "ok"))
        if op == "fileExports":
            return self.file_exports(params, self.outcomes.get(op, "ok"))
        raise LookupError(op)

    def file_exports(self, params: dict, shape: str) -> dict:
        schema = schema_for("fileExports")
        target = params.get("file") or ""
        if target.startswith("missing"):
            raise KeyError(target)
        folder = not target.endswith((".ts", ".tsx"))
        files = ["src/components/Card.tsx", "src/components/types.ts"] if folder else [target]
        def export(file: str, name: str, line: int, kind: str, traceable: bool) -> dict:
            return {**example(item_schema(schema, "files", "exports")), "id": f"{file}@{name}:{line}", "name": name, "kind": kind,
                    "file": file, "absPath": f"{self.args.root}/{file}", "line": line, "column": 17, "traceable": traceable, "reexported": False}
        listed = [{"file": file, "absPath": f"{self.args.root}/{file}",
                   "exports": [export(file, "Card", 1, "component", True), export(file, "CardProps", 9, "interface", False)] if file.endswith(".tsx")
                   else [export(file, "Item", 1, "type", False)]} for file in files]
        exports = [item for entry in listed for item in entry["exports"]]
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "reason": None,
                "target": {"path": target or ".", "absPath": f"{self.args.root}/{target}", "kind": "folder" if folder else "file"},
                "files": listed, "counts": {"files": len(listed), "exports": len(exports), "traceable": sum(1 for item in exports if item["traceable"])}}
        if shape == "partial":
            return {**base, "outcome": "partial", "reason": "budget-exhausted"}
        if shape == "unsupported":
            return {**base, "outcome": "unsupported", "reason": "no-program-file", "files": [], "counts": {"files": 0, "exports": 0, "traceable": 0}}
        return base

    def route_path(self, params: dict, shape: str) -> dict:
        schema = schema_for("routePath")
        if params.get("edge") not in ("edge:1", "field:1"):
            raise KeyError(params.get("edge"))
        file = "src/routes/records.tsx"
        row = lambda **fields: {**example(item_schema(schema, "rows")), "file": file, "absPath": f"{self.args.root}/{file}", "line": 1,
                                "span": self.span(), "status": "proven", "elementId": "el:1", "relationId": "rel:1", "proof": [],
                                "typeText": None, "note": None, "reason": None, **fields}
        rows = [row(id="row:1", kind="input", label="createResource(loadViewer)", relationId=None), row(id="row:2", kind="terminal", label="slot", note="render terminal")]
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "reason": None,
                "route": {"key": "route:records", "pathPattern": "/records"},
                "edge": {"id": params["edge"], "kind": "handoff", "label": None, "status": "proven", "source": "el:1", "target": "el:2"},
                "rows": rows, "proof": [], "frontier": None}
        if shape == "partial":
            stop = row(id="row:2", kind="boundary", label="lineage stops", status="partial", reason="partial-proof", note="The field's proof stops here.")
            return {**base, "outcome": "partial", "edge": {**base["edge"], "kind": "field", "label": "rows[*].title", "status": "partial"},
                    "rows": [rows[0], stop], "frontier": {"reason": "partial-proof", "label": "rows[*].title"}}
        if shape == "unsupported":
            return {**base, "outcome": "unsupported", "reason": "no-evidence-slice", "rows": []}
        return base

    def function_effects(self, params: dict, shape: str) -> dict:
        schema = schema_for("functionEffects")
        file = params["file"]
        line = params.get("line", 1)
        span = self.span(line, 1, 20)
        witness = {"file": file, "absPath": f"{self.args.root}/{file}", "line": line, "span": span, "text": "fetch(url)"}
        fact = {**example(item_schema(schema, "facts")), "id": "fact:1", "family": "external", "kind": "network-request", "label": "fetch",
                "detail": "A network request leaves the program.", "status": "proven", "activation": "direct", "via": [], "witness": witness}
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "reason": None,
                "callable": {"name": "load", "kind": "function", "async": True, "file": file, "absPath": f"{self.args.root}/{file}", "line": line, "span": span},
                "facts": [fact], "frontiers": [], "resultHandling": [{"callee": "fetch", "handling": "awaited", "witness": witness}],
                "coverage": "complete-for-supported-scope", "counts": {"facts": 1, "frontiers": 0, "callables": 1},
                "assumptions": ["Intrinsics are taken as pure unless named."]}
        if shape == "partial":
            frontier = {**example(item_schema(schema, "frontiers")), "id": "frontier:1", "reason": "callback-parameter", "label": "callback",
                        "detail": "callback is a parameter: what it does depends on the caller.", "via": [], "witness": {**witness, "text": "callback()"}}
            return {**base, "outcome": "partial", "frontiers": [frontier], "coverage": "partial", "counts": {"facts": 1, "frontiers": 1, "callables": 1}}
        if shape == "unsupported":
            return {**base, "outcome": "unsupported", "reason": "no-callable", "facts": [], "resultHandling": [], "coverage": "not-analyzed",
                    "counts": {"facts": 0, "frontiers": 0, "callables": 0}}
        return base

    def route(self) -> dict:
        return {**example(item_schema(schema_for("routes"), "routes")), "key": "route:records", "pathPattern": "/records",
                "file": "src/routes/records.tsx", "absPath": f"{self.args.root}/src/routes/records.tsx", "parameters": []}

    def span(self, line: int = 1, start: int = 1, end: int = 10) -> dict:
        return {"startLine": line, "startColumn": start, "endLine": line, "endColumn": end}

    def route_graph(self, params: dict, shape: str) -> dict:
        if params.get("route") not in ("route:records", "/records"):
            raise KeyError(params.get("route"))
        schema = schema_for("routeGraph")
        file = "src/routes/records.tsx"
        node = lambda **fields: {**example(item_schema(schema, "nodes")), "file": file, "absPath": f"{self.args.root}/{file}",
                                 "line": 1, "span": self.span(), "status": "proven", "collapsedByDefault": False,
                                 "repetition": None, "external": False, "reason": None, "detail": None, "parent": None, **fields}
        route = node(id="occ:route", kind="route", label="/records")
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "phase": "complete",
                "route": {"key": "route:records", "pathPattern": "/records", "file": file, "absPath": f"{self.args.root}/{file}"},
                "status": "complete", "unavailableReason": None, "nodes": [route], "edges": [], "origins": [],
                "selectedSource": None, "lineage": None, "destinations": [],
                "counts": {"occurrences": 0, "boundaries": 0, "terminals": 0, "origins": 0, "handoffs": 0, "omittedItems": 0},
                "gaps": []}
        if shape == "partial":
            # One occurrence owns a located gap; the route box and the render edge into it say so.
            card = node(id="occ:card", kind="occurrence", label="Card", detail="Card.tsx", parent="occ:route", line=2,
                        span=self.span(2), status="partial", reason="external-code")
            edge = {**example(item_schema(schema, "edges")), "id": "edge:1", "source": "occ:route", "target": "occ:card",
                    "kind": "render", "label": None, "status": "partial", "proof": [], "pathIds": None}
            gap = {**example(item_schema(schema, "gaps")), "reason": "external-code",
                   "label": "Static proof stops at the external response body.",
                   "location": {"file": file, "line": 2, "column": 1, "span": self.span(2)}}
            return {**base, "outcome": "partial", "status": "partial", "nodes": [route, card], "edges": [edge], "gaps": [gap],
                    "counts": {**base["counts"], "occurrences": 1}}
        if shape == "unsupported":
            return {**base, "outcome": "unsupported", "status": "unavailable", "unavailableReason": "no-route-component",
                    "nodes": [node(id="occ:route", kind="route", label="/records", status="unsupported", reason="no-route-component")]}
        return base

    def anchor_graph(self, params: dict, shape: str) -> dict:
        if params.get("name") and params.get("name") != "props":
            raise KeyError(params.get("name"))
        schema = schema_for("anchorGraph")
        span = params.get("span") or self.span(params.get("line", 1), 1, 6)
        file = params["file"]
        text = params.get("text") or params.get("name") or "x"
        direction = params.get("direction", "both")
        node = lambda **fields: {**example(item_schema(schema, "nodes")), "file": file, "absPath": f"{self.args.root}/{file}",
                                 "line": span["startLine"], "span": span, "status": "proven", "side": "seed", "detail": None,
                                 "parent": "scope:f", "elementKind": None, "typeText": None, "reason": None, "note": None, **fields}
        scope = node(id="scope:f", kind="scope", label="Card", detail="f.tsx", parent=None)
        anchor = node(id="el:1", kind="anchor", label=text, detail="property read", elementKind="field-read", typeText="string")
        slot = node(id="el:2", kind="terminal", label="slot", detail="render slot", side="down", elementKind="render-terminal")
        # A declaration's parameter, found by syntax: a structural edge into the anchor on the up side.
        param = node(id="el:0", kind="value", label="props", detail="parameter", side="up", elementKind="parameter")
        edge = lambda **fields: {**example(item_schema(schema, "edges")), "status": "proven", "proof": [], "label": None, **fields}
        nodes = [scope, anchor] + ([slot] if direction != "backward" else []) + ([param] if direction != "forward" else [])
        edges = ([] if direction == "backward" else [edge(id="rel:1", source="el:1", target="el:2", kind="render-terminal")]) + \
                ([] if direction == "forward" else [edge(id="parameter:el:0", source="el:0", target="el:1", kind="parameter", status="structural")])
        counts = {"up": 0 if direction == "forward" else 1, "down": 0 if direction == "backward" else 1, "scopes": 1,
                  "origins": 0, "terminals": 0 if direction == "backward" else 1, "boundaries": 0, "frontiers": 0}
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "reason": None,
                "anchor": {"file": file, "absPath": f"{self.args.root}/{file}", "span": span, "text": text,
                           "kind": "PropertyAccessExpression", "elementId": "el:1", "typeText": "string"},
                "direction": direction, "nodes": nodes, "edges": edges, "origins": [],
                "terminals": [{"nodeId": "el:2", "label": "slot", "roles": ["render"], "status": "proven"}] if direction != "backward" else [],
                "counts": counts,
                "coverage": {"elements": len(nodes) - 1, "relations": len(edges), "budget": {"limit": 256, "used": len(edges), "exhausted": False}}}
        if shape == "partial":
            # A dead end: the value reaches a local nothing reads.
            stop = node(id="frontier:gap-1", kind="frontier", label="unused", detail="disconnected",
                        side="down", status="partial", elementKind="alias", reason="disconnected", note="dead end · nothing continues from here")
            gap = edge(id="gap:gap-1", source="el:1", target="frontier:gap-1", kind="gap", status="partial")
            return {**base, "outcome": "partial", "nodes": [*nodes, stop], "edges": [*edges, gap],
                    "counts": {**counts, "down": counts["down"] + 1, "frontiers": 1}}
        if shape == "unsupported":
            bare = node(id="anchor:f:1:1", kind="anchor", label=text, detail="property read", status="partial",
                        reason="no-evidence-element", note="The engine has no evidence element at exactly this expression.")
            return {**base, "outcome": "unsupported", "reason": "no-evidence-element",
                    "anchor": {**base["anchor"], "elementId": None}, "nodes": [scope, bare], "edges": [], "terminals": [],
                    "counts": {**counts, "up": 0, "down": 0, "terminals": 0},
                    "coverage": {"elements": 0, "relations": 0, "budget": {"limit": 0, "used": 0, "exhausted": False}}}
        return base

    def value_flow(self, params: dict, shape: str) -> dict:
        schema = schema_for("valueFlow")
        file = params["file"]
        span = params.get("span") or self.span()
        text = params.get("text") or "props.item.title"
        row = lambda **fields: {**example(item_schema(schema, "rows")), "file": file, "absPath": f"{self.args.root}/{file}",
                                "line": span["startLine"], "span": span, "status": "proven", "elementId": "el:1", "relationId": None,
                                "proof": [], "typeText": "string", "note": None, "reason": None, **fields}
        selection = {**example(item_schema(schema, "selection")), "file": file, "span": span, "text": text, "kind": "PropertyAccessExpression"}
        rows = [row(id="row:1", kind="input", label=text),
                row(id="row:2", kind="terminal", label=text, elementId="el:2", relationId="rel:1", note="JSX render slot")]
        base = {**example(schema), "outcome": "ok", **self.generation_fields(), "reason": None, "selection": selection,
                "rows": rows, "frontiers": [], "terminals": ["row:2"],
                "coverage": {"elements": 2, "relations": 1, "budget": {"limit": 256, "used": 1, "exhausted": False}},
                "bindings": {"tsconfig": f"{self.args.root}/tsconfig.json", "typescript": "5.9.3",
                             "sourceFingerprints": [{"file": file, "size": 1, "mtimeMs": 1}]}}
        if shape == "partial":
            boundary = row(id="row:2", kind="boundary", label="shout(…)", status="partial", reason="unproven-handoff",
                           note="shout has 2 call sites (src/f.tsx:3, src/f.tsx:4)")
            return {**base, "outcome": "partial", "rows": [rows[0], boundary], "terminals": [],
                    "frontiers": [{"rowId": "row:2", "reason": "unproven-handoff", "label": "shout(…)"}]}
        if shape == "unsupported":
            return {**base, "outcome": "unsupported", "reason": "no-evidence-element",
                    "rows": [row(id="row:1", kind="input", label=text, status="partial", elementId=None)], "terminals": [],
                    "coverage": {"elements": 0, "relations": 0, "budget": {"limit": 0, "used": 0, "exhausted": False}}}
        return base

    def select_expression(self, params: dict) -> dict:
        schema = schema_for("selectExpression")
        span = params.get("span") or self.span()
        candidate = {**example(item_schema(schema, "candidates")), "span": span, "text": params.get("text") or "props.item.title",
                     "kind": "PropertyAccessExpression"}
        return {**example(schema), "outcome": "ok", **self.generation_fields(), "file": params["file"], "reason": None, "candidates": [candidate]}

    # ---- errors a shape asks for ---------------------------------------------

    def error_for(self, op: str) -> dict | None:
        shape = self.outcomes.get(op)
        if shape == "budget":
            return {"code": "budget-exhausted", "message": f"The {op} result is over the 8388608-byte bound", "details": {"bytes": 9000000}}
        if shape == "stale":
            return {"code": "stale-generation", "message": "stale", "details": {"generation": self.state["generation"] or 1, "programHash": "hash-2"}}
        if shape == "not-analyzed":
            return {"code": "no-ts-files", "message": "No TypeScript files under the source directory"}
        return None


# ---- the process ----------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="")
    parser.add_argument("--source", default="")
    parser.add_argument("--tsconfig", default=None)
    parser.add_argument("--language", default="typescript")
    parser.add_argument("--python", default=None)
    parser.add_argument("--delay", action="append", default=[])
    parser.add_argument("--hang", action="append", default=[])
    parser.add_argument("--ignore-cancel", action="store_true")
    parser.add_argument("--crash", action="append", default=[])
    parser.add_argument("--garbage", action="append", default=[])
    parser.add_argument("--protocol", type=int, default=1)
    parser.add_argument("--refuse", default=None)
    parser.add_argument("--outcome", action="append", default=[])
    parser.add_argument("--stale", action="store_true")
    args = parser.parse_args(argv)
    engine = FakeEngine(args)

    delays = {op: float(seconds) for op, seconds in (item.split("=", 1) for item in args.delay)}
    write_lock = threading.Lock()
    hanging: set[int] = set()
    cancelled: set[int] = set()

    def send(frame: dict) -> None:
        with write_lock:
            sys.stdout.write(json.dumps(frame) + "\n")
            sys.stdout.flush()

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
        if expected is not None and engine.state["generation"] and expected != engine.state["generation"]:
            send({"id": request_id, "ok": False, "error": {"code": "stale-generation", "message": "stale",
                                                         "details": {"generation": engine.state["generation"], "programHash": engine.hash()}}})
            return
        error = engine.error_for(op)
        if error is not None:
            send({"id": request_id, "ok": False, "error": error})
            return
        try:
            send({"id": request_id, "ok": True, "result": engine.result_for(op, params)})
        except KeyError as missing:
            send({"id": request_id, "ok": False, "error": {"code": "not-found", "message": f"No route {missing}"}})
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


if __name__ == "__main__":
    main()
