import { describe, expect, it } from "vitest";
import { flowPlaceLabel, recentFlowPlaces } from "./flowPlaces";
import type { HistoryEntry } from "./history";

const base = { repo: "/r", at: "", view: "graph" as const };
const entry = (loc: Partial<HistoryEntry["loc"]>, time: number): HistoryEntry => ({ loc: { ...base, ...loc }, time });

describe("anchor history (T18)", () => {
  it("names an anchor by its symbol or span and a route by its path", () => {
    expect(flowPlaceLabel({ ...base, anchor: "src/a.tsx@ViewerCard:3", dir: "forward" })).toEqual({ kind: "anchor", leaf: "ViewerCard", detail: "src/a.tsx", dir: "forward" });
    expect(flowPlaceLabel({ ...base, anchor: "src/a.tsx:6:10-6:24" })).toEqual({ kind: "anchor", leaf: "6:10–6:24", detail: "src/a.tsx", dir: "both" });
    expect(flowPlaceLabel({ ...base, anchor: "src/utils@*" })).toEqual({ kind: "exports", leaf: "src/utils", detail: "exports", dir: "both" });
    expect(flowPlaceLabel({ ...base, flow: "/records" })).toEqual({ kind: "route", leaf: "/records", detail: null, dir: null });
    expect(flowPlaceLabel({ ...base, flow: "route:1" }, (key) => (key === "route:1" ? "/records" : key))!.leaf).toBe("/records");
    expect(flowPlaceLabel({ ...base, flow: "" })).toBeNull();
    expect(flowPlaceLabel({ ...base, view: "treemap" })).toBeNull();
  });

  it("lists this repo's data-flow places newest first, skipping the import graph, the treemap and other repos", () => {
    const entries = [
      entry({ anchor: "src/a.tsx@ViewerCard:3" }, 5),
      entry({ view: "treemap", at: "src" }, 4),
      entry({ flow: "/records" }, 3),
      entry({ repo: "/other", flow: "/x" }, 2),
      entry({ at: "src" }, 1),
      entry({ flow: "" }, 0),
    ];
    expect(recentFlowPlaces(entries, "/r").map((p) => p.label.leaf)).toEqual(["ViewerCard", "/records"]);
    expect(recentFlowPlaces(entries, "/r", undefined, 1).map((p) => p.label.leaf)).toEqual(["ViewerCard"]);
  });
});
