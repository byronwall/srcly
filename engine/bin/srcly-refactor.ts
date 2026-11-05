import fs from "node:fs";
import { project } from "../src/refactor/typescript";
import { Refusal } from "../src/refactor/symbols";

try {
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  const compiler = project(request.root, request.config);
  try {
    const result = request.action ? compiler.transform(request.action) : { graph: compiler.graph(), symbols: compiler.symbols(), diagnostics: compiler.diagnostics() };
    process.stdout.write(JSON.stringify(result));
  } finally { compiler.dispose(); }
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error), ...(error instanceof Refusal ? { diagnostic: { code: error.code, message: error.message, details: error.details, suggestions: error.suggestions, line: null } } : {}) }));
  process.exitCode = 1;
}
