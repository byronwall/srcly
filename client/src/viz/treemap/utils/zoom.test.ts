import { describe, expect, it } from "vitest";
import { hierarchy, treemap } from "d3";
import { zoomTransforms } from "./zoom";

const child = { path: "/repo/src", children: [{ path: "/repo/src/file", loc: 10 }] };
const data = { path: "/repo", children: [{ path: "/repo/other", loc: 10 }, child] };
const layout = (root: typeof data | typeof child) =>
  treemap<typeof root>().size([400, 200])(hierarchy(root).sum((node) => "loc" in node ? Number(node.loc) : 0)).descendants();

describe("canvas zoom continuity", () => {
  it("reverses the same tile transforms when returning to an ancestor", () => {
    const full = layout(data);
    const focused = layout(child);
    const into = zoomTransforms(full, focused, 400, 200);
    const out = zoomTransforms(focused, full, 400, 200);
    expect(into).toEqual({
      incoming: "translate(200px, 0px) scale(0.5, 1)",
      outgoing: "translate(-400px, 0px) scale(2, 1)",
    });
    expect(out).toEqual({ incoming: into!.outgoing, outgoing: into!.incoming });
  });

  it("does not animate filters, unrelated roots, or empty tiles", () => {
    const full = layout(data);
    expect(zoomTransforms(full, layout(data), 400, 200)).toBeNull();
    expect(zoomTransforms(full, layout({ path: "/elsewhere", children: [] }), 400, 200)).toBeNull();
    expect(zoomTransforms([], full, 400, 200)).toBeNull();
    expect(zoomTransforms(full, layout(child), 0, 200)).toBeNull();
    const tile = full.find((node) => node.data.path === child.path)!;
    tile.x1 = tile.x0;
    expect(zoomTransforms(full, layout(child), 400, 200)).toBeNull();
  });
});
