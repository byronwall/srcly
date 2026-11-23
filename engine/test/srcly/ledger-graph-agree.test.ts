import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { valueFlowOp } from "../../src/srcly/ops/value-flow";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

const ROOTS = ["value-flow-basics", "value-flow-js", "value-flow-loose"];

/** Every forward text anchor the fixtures declare: `@trace <id> forward|both <text>`. */
function anchors(source: string) {
  const found: { id: string; file: string; line: number; text: string; column: number }[] = [];
  for (const name of fs.readdirSync(source).filter((item) => /\.[cm]?[jt]sx?$/.test(item)).sort()) {
    const lines = fs.readFileSync(path.join(source, name), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/@trace\s+(\S+)\s+(forward|both)\s+(.*?)\s*(?:\*\/|$|\s(?=@))/g)) {
        if (match[3].startsWith("symbol ")) continue;
        const code = (text: string) => text.replace(/\s*(\/\/|\{?\/\*).*$/, "");
        let target = index;
        if (!code(line).trim() || code(line).trim() === "{") {
          target = index + 1;
          while (target < lines.length && (!code(lines[target]).trim() || code(lines[target]).trim() === "{")) target++;
        }
        const column = code(lines[target]).indexOf(match[3]) + 1;
        if (column < 1) throw new Error(`src/${name}:${target + 1} @trace ${match[1]}: \`${match[3]}\` is not on this line`);
        found.push({ id: match[1], file: `src/${name}`, line: target + 1, text: match[3], column });
      }
    });
  }
  return found;
}

describe.each(ROOTS)("the ledger and the graph in %s", (name) => {
  const root = fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
  const source = path.join(root, "src");
  const session = createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
  const list = anchors(source);

  it("give the same outcome and the same stops on every forward text anchor", () => {
    const differ: string[] = [];
    for (const item of list) {
      const span = { startLine: item.line, startColumn: item.column, endLine: item.line, endColumn: item.column + item.text.length };
      const at = { file: item.file, text: item.text, span };
      let ledger: string;
      try {
        const result = valueFlowOp(session, at);
        const rows = new Map(result.rows.map((row) => [row.id, row]));
        ledger = `${result.outcome} ${result.frontiers.map((f) => `${f.reason}@${rows.get(f.rowId)!.file}:${rows.get(f.rowId)!.line}`).sort().join(",")}`;
      } catch (error) {
        ledger = `error ${(error as Error).message.slice(0, 40)}`;
      }
      const graph = anchorGraphOp(session, { ...at, direction: "forward" });
      const g = `${graph.outcome} ${graph.nodes.filter((n) => n.kind === "frontier" || (n.kind === "boundary" && n.status !== "proven")).map((n) => `${n.reason}@${n.file}:${n.line}`).sort().join(",")}`;
      const set = (text: string) => [...new Set(text.split(" ")[1].split(",").filter(Boolean))].join(",");
      if (ledger.split(" ")[0] !== g.split(" ")[0] || set(ledger) !== set(g)) differ.push(`${item.file}:${item.line} ${item.id} ${item.text}: ledger ${ledger} · graph ${g}`);
    }
    expect(list.length).toBeGreaterThan(0);
    expect(differ).toEqual([]);
  }, 600_000);
});
