import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeGraphOp } from "../src/srcly/ops/route-graph";
import { createEngineSession } from "../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../src/srcly/typescript-choice";

// Regenerates test/srcly/__fixtures__/solid-route.route-graph.json, the
// routeGraph result the client's adapter test reads. Absolute paths are
// rewritten under /fixture so the file is the same on every machine.
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(engineRoot, "examples/solid-route");
const session = createEngineSession({ root, source: path.join(root, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
const graph = routeGraphOp(session, { route: "/records" });
const text = JSON.stringify(graph, null, 1).replaceAll(root, "/fixture/solid-route").replaceAll(ENGINE_PACKAGE_DIR, "/fixture/engine");
const target = path.join(engineRoot, "test/srcly/__fixtures__/solid-route.route-graph.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${text}\n`);
process.stdout.write(`wrote ${path.relative(engineRoot, target)} (${graph.nodes.length} nodes, ${graph.edges.length} edges)\n`);
