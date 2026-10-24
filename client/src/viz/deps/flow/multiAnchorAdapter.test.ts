import { describe, expect, it } from "vitest";
import anchorOk from "../../../../../server/tests/snapshots/fake-engine.anchorGraph.ok.json";
import type { AnchorGraphResult } from "../../../dataflow/contract.generated";
import { anchorsToViewModel } from "./multiAnchorAdapter";

const base = anchorOk as AnchorGraphResult;

/** A second anchor whose trace reaches one of the first's boxes and one of its own. */
function second(): AnchorGraphResult {
  const anchor = base.nodes.find((n) => n.kind === "anchor")!;
  const other = base.nodes.find((n) => n.kind !== "anchor" && n.kind !== "scope")!;
  const own = { ...other, id: "el:only-second", label: "onlySecond" };
  const anchor2 = { ...anchor, id: "el:anchor-2", label: "second" };
  return {
    ...base,
    anchor: { ...base.anchor, text: "second", elementId: anchor2.id },
    nodes: [anchor2, other, own, ...base.nodes.filter((n) => n.kind === "scope")],
    edges: [
      { ...base.edges[0], id: "e:2a", source: anchor2.id, target: other.id },
      { ...base.edges[0], id: "e:2b", source: anchor2.id, target: own.id },
    ],
  };
}

describe("several anchors on one canvas (T20)", () => {
  it("merges two traces by element id and marks the boxes where they meet", () => {
    const { model, shared } = anchorsToViewModel([base, second()]);
    const other = base.nodes.find((n) => n.kind !== "anchor" && n.kind !== "scope")!;
    expect([...shared.keys()]).toEqual([other.id]);
    expect(shared.get(other.id)).toEqual([base.anchor.text, "second"]);
    const drawn = model.vm.nodes.find((n) => n.id === other.id)!;
    expect(drawn.lit).toBe(true);
    expect(drawn.note).toContain("meet");
    // Both anchors are focus boxes; every other box appears once.
    expect(model.vm.nodes.filter((n) => n.isFocus).length).toBe(2);
    expect(new Set(model.vm.nodes.map((n) => n.id)).size).toBe(model.vm.nodes.length);
    expect(model.vm.nodes.some((n) => n.id === "el:only-second")).toBe(true);
    expect(model.vm.focusLabel).toBe(`${base.anchor.text} + second`);
    expect(model.lit?.nodes.has(other.id)).toBe(true);
  });

  it("is the plain anchor model for one anchor, with nothing shared", () => {
    const { model, shared } = anchorsToViewModel([base]);
    expect(shared.size).toBe(0);
    expect(model.lit).toBeNull();
    expect(model.vm.nodes.length).toBe(base.nodes.filter((n) => n.kind !== "scope").length);
  });
});
