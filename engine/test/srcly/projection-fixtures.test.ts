import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

// Real anchor graphs for the client's projection checks (PW01, PW03 in
// `client/src/viz/deps/flow/projection.test.ts`): what the merged canvas and
// reach emphasis draw must keep each anchor's own witnesses. Rewrite them with
// `SRCLY_UPDATE_SNAPSHOTS=1 pnpm vitest run test/srcly/projection-fixtures.test.ts`.
const root = fileURLToPath(new URL("../../examples/value-flow-basics", import.meta.url));
const source = path.join(root, "src");
const out = fileURLToPath(new URL("../../../client/src/viz/deps/flow/__fixtures__/projection-anchors.json", import.meta.url));
const ANCHORS = [
  { file: "src/two-call-identity-helper.tsx", line: 11, text: "props.a" },
  { file: "src/two-call-identity-helper.tsx", line: 12, text: "props.b" },
  { file: "src/returns-other-argument.tsx", line: 9, text: "props.first" },
  { file: "src/returns-other-argument.tsx", line: 9, text: "props.second" },
];

describe("projection fixtures", () => {
  it("match what the engine draws", () => {
    const session = createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
    const graphs = ANCHORS.map(({ file, line, text }) => {
      const column = fs.readFileSync(path.join(root, file), "utf8").split("\n")[line - 1].indexOf(text) + 1;
      return anchorGraphOp(session, { file, text, direction: "forward", span: { startLine: line, startColumn: column, endLine: line, endColumn: column + text.length } });
    });
    // Machine-free: no checkout path, no generation.
    const json = `${JSON.stringify(graphs, null, 1).replaceAll(root, "<root>").replace(/"(generation|programHash|typescript|tsconfig)": "[^"]*"/g, '"$1": ""')}\n`;
    if (process.env.SRCLY_UPDATE_SNAPSHOTS === "1") fs.writeFileSync(out, json);
    expect(fs.readFileSync(out, "utf8")).toBe(json);
  });
});
