import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { valueFlowOp } from "../../src/srcly/ops/value-flow";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

const root = fileURLToPath(new URL("../../examples/value-flow-basics", import.meta.url));
const source = path.join(root, "src");

/** Every forward text anchor the fixtures declare: `@trace <id> forward|both <text>`. */
function anchors() {
  const found: { id: string; file: string; line: number; text: string; column: number }[] = [];
  for (const name of fs.readdirSync(source).filter((item) => /\.[cm]?[jt]sx?$/.test(item)).sort()) {
    const lines = fs.readFileSync(path.join(source, name), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/@trace\s+(\S+)\s+(forward|both)\s+(.*?)\s*(?:\*\/|$|\s@)/g)) {
        if (match[3].startsWith("symbol ")) continue;
        const code = (text: string) => text.replace(/\s*(\/\/|\{?\/\*).*$/, "");
        let target = index;
        if (!code(line).trim() || code(line).trim() === "{") {
          target = index + 1;
          while (target < lines.length && (!code(lines[target]).trim() || code(lines[target]).trim() === "{")) target++;
        }
        const column = code(lines[target]).indexOf(match[3]) + 1;
        if (column > 0) found.push({ id: match[1], file: `src/${name}`, line: target + 1, text: match[3], column });
      }
    });
  }
  return found;
}

describe("the ledger and the graph", () => {
  const session = createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
  const list = anchors();

  it("give the same outcome on every forward text anchor", () => {
    const differ: string[] = [];
    for (const item of list) {
      const span = { startLine: item.line, startColumn: item.column, endLine: item.line, endColumn: item.column + item.text.length };
      const at = { file: item.file, text: item.text, span };
      let ledger: string;
      try {
        const result = valueFlowOp(session, at);
        ledger = `${result.outcome} ${result.frontiers.map((f) => f.reason).sort().join(",")}`;
      } catch (error) {
        ledger = `error ${(error as Error).message.slice(0, 40)}`;
      }
      const graph = anchorGraphOp(session, { ...at, direction: "forward" });
      const g = `${graph.outcome} ${graph.nodes.filter((n) => n.kind === "frontier" || (n.kind === "boundary" && n.status !== "proven")).map((n) => n.reason).sort().join(",")}`;
      const set = (text: string) => [...new Set(text.split(" ")[1].split(",").filter(Boolean))].join(",");
      if (ledger.split(" ")[0] !== g.split(" ")[0] || set(ledger) !== set(g)) differ.push(`${item.file}:${item.line} ${item.id} ${item.text}: ledger ${ledger} · graph ${g}`);
    }
    console.log(list.length, "anchors\n" + differ.join("\n"));
    expect(differ).toEqual([]);
  }, 600_000);
});
