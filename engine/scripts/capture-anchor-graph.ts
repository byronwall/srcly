import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorGraphOp } from "../src/srcly/ops/anchor-graph";
import { createEngineSession } from "../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../src/srcly/typescript-choice";

// Regenerates test/srcly/__fixtures__/solid-route.anchor-graph.json, the
// anchorGraph result the client's adapter test reads: both directions from
// `props.viewer?.name` in ViewerCard. Absolute paths are rewritten under
// /fixture so the file is the same on every machine.
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(engineRoot, "examples/solid-route");
const session = createEngineSession({ root, source: path.join(root, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
const file = "src/components/ViewerCard.tsx";
const text = "props.viewer?.name";
const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
const index = lines.findIndex((line) => line.includes(text));
const column = lines[index].indexOf(text) + 1;
const span = { startLine: index + 1, startColumn: column, endLine: index + 1, endColumn: column + text.length };
const write = (name: string, params: Record<string, unknown>) => {
  const graph = anchorGraphOp(session, params);
  const out = JSON.stringify(graph, null, 1).replaceAll(root, "/fixture/solid-route").replaceAll(ENGINE_PACKAGE_DIR, "/fixture/engine");
  const target = path.join(engineRoot, "test/srcly/__fixtures__", name);
  fs.writeFileSync(target, `${out}\n`);
  process.stdout.write(`wrote ${path.relative(engineRoot, target)} (${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.outcome})\n`);
};
write("solid-route.anchor-graph.json", { file, text, span, direction: "both" });
// A declaration anchor (ViewerCard by name): its parameter and return links are structural.
write("solid-route-viewer-card.anchor-graph.json", { file, name: "ViewerCard", line: 3, direction: "both" });
