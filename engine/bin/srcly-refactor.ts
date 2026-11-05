import fs from "node:fs";
import { project } from "../src/refactor/typescript";

try {
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  const compiler = project(request.root, request.config);
  try {
    const result = request.action ? { changes: compiler.moveFile(request.action) } : { graph: compiler.graph(), diagnostics: compiler.diagnostics() };
    process.stdout.write(JSON.stringify(result));
  } finally { compiler.dispose(); }
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
