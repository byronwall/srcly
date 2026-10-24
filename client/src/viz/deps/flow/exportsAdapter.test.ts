import { describe, expect, it } from "vitest";
import anchorOk from "../../../../../server/tests/snapshots/fake-engine.anchorGraph.ok.json";
import exportsOk from "../../../../../server/tests/snapshots/fake-engine.fileExports.ok.json";
import type { AnchorGraphResult, FileExportsResult } from "../../../dataflow/contract.generated";
import { EXPORTS_BUDGET, exportsToViewModel } from "./exportsAdapter";

const result = exportsOk as FileExportsResult;
const graph = anchorOk as AnchorGraphResult;

describe("a file or folder anchor fans out to its exports (T19)", () => {
  it("draws the target as the focus and one box per export in its file's frame, type-only exports dotted", () => {
    const model = exportsToViewModel(result, { expanded: [], graphs: new Map() });
    expect(model.vm.focusId).toBe("exports:src/components");
    const boxes = model.vm.nodes.filter((n) => !n.isFocus);
    expect(boxes.map((n) => n.label)).toEqual(["Card", "CardProps", "Item"]);
    expect(boxes.map((n) => n.expandable)).toEqual([true, false, false]);
    expect(boxes.find((n) => n.label === "CardProps")?.outline).toBe("dotted");
    expect(boxes.map((n) => n.group?.id)).toEqual(["file:src/components/Card.tsx", "file:src/components/Card.tsx", "file:src/components/types.ts"]);
    // Ownership edges order the layout but are not drawn.
    expect(model.vm.edges.every((e) => model.hidden.has(e.id))).toBe(true);
  });

  it("opens an export into its anchor graph, prefixed so two expansions never collide, with the anchor box keeping the export id", () => {
    const card = result.files[0].exports[0];
    const model = exportsToViewModel(result, { expanded: [card.id], graphs: new Map([[card.id, graph]]) });
    const inFrame = model.vm.nodes.filter((n) => n.group?.id === card.id);
    expect(inFrame.length).toBeGreaterThan(1);
    expect(inFrame.some((n) => n.id === card.id && n.label === "Card")).toBe(true);
    expect(inFrame.filter((n) => n.id !== card.id).every((n) => n.id.startsWith(`${card.id}|`))).toBe(true);
    expect(model.vm.edges.some((e) => e.id.startsWith(`${card.id}|`))).toBe(true);
    expect(model.byId.size).toBe(inFrame.length);
    expect(inFrame.every((n) => n.region === "out")).toBe(true);
    expect(exportsToViewModel(result, { expanded: [card.id], graphs: new Map([[card.id, graph]]), dir: "backward" }).vm.nodes.filter((n) => !n.isFocus).every((n) => n.region === "in")).toBe(true);
    // Still waiting for the graph: the box says so and cannot open twice.
    const waiting = exportsToViewModel(result, { expanded: [card.id], graphs: new Map() });
    expect(waiting.vm.nodes.find((n) => n.id === card.id)).toMatchObject({ note: "tracing…", expandable: false });
  });

  it("folds a folder over the budget into files with counts until a file is opened", () => {
    const many: FileExportsResult = {
      ...result,
      files: Array.from({ length: 6 }, (_, i) => ({
        file: `src/u/f${i}.ts`,
        absPath: `/r/src/u/f${i}.ts`,
        exports: Array.from({ length: 10 }, (_, j) => ({ ...result.files[0].exports[0], id: `src/u/f${i}.ts@e${j}:${j + 1}`, name: `e${j}`, file: `src/u/f${i}.ts`, line: j + 1 })),
      })),
      counts: { files: 6, exports: 60, traceable: 60 },
    };
    expect(60).toBeGreaterThan(EXPORTS_BUDGET);
    const folded = exportsToViewModel(many, { expanded: [], graphs: new Map() });
    expect(folded.vm.nodes.filter((n) => !n.isFocus).map((n) => [n.kind, n.memberCount])).toEqual(Array.from({ length: 6 }, (_, i) => ["file", 10]));
    const opened = exportsToViewModel(many, { expanded: ["src/u/f2.ts"], graphs: new Map() });
    expect(opened.vm.nodes.filter((n) => n.group?.id === "src/u/f2.ts").length).toBe(10);
    expect(opened.vm.nodes.filter((n) => n.kind === "file").length).toBe(5);
  });
});
