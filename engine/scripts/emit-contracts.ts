import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitContracts } from "../src/srcly/contracts/emit";

// Writes the JSON Schemas Python validates against and the client's generated
// types. Run after changing anything under src/srcly/contracts.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const [relative, text] of emitContracts()) {
  const target = path.join(repositoryRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  process.stdout.write(`wrote ${relative}\n`);
}
