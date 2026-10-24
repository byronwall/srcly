import { describe, expect, it } from "vitest";
import effectsOk from "../../../server/tests/snapshots/fake-engine.functionEffects.ok.json";
import effectsPartial from "../../../server/tests/snapshots/fake-engine.functionEffects.partial.json";
import effectsUnsupported from "../../../server/tests/snapshots/fake-engine.functionEffects.unsupported.json";
import type { FunctionEffectsResult } from "./contract.generated";
import { effectsView, viaText } from "./effectsModel";

// The fake engine's three shapes, written by server/tests/test_dataflow_outcomes.py.
describe("the effects view", () => {
  it("groups known facts by family and keeps the frontiers beside them", () => {
    const view = effectsView(effectsOk as FunctionEffectsResult);
    expect(view.headline).toBe("1 known effect");
    expect(view.groups.map((group) => [group.family, group.facts.length, group.proven])).toEqual([["external", 1, 1]]);
    expect(view.frontiers).toEqual([]);
    expect(view.handling.map((h) => `${h.callee} ${h.handling}`)).toEqual(["fetch awaited"]);
    expect(view.assumptions.length).toBeGreaterThan(0);
  });

  it("says how many places it could not follow, with the frontier's reason", () => {
    const view = effectsView(effectsPartial as FunctionEffectsResult);
    expect(view.headline).toBe("1 known effect · 1 place the analysis could not follow");
    expect(view.frontiers.map((f) => f.reason)).toEqual(["callback-parameter"]);
    expect(view.coverage).toBe("partial");
  });

  it("names no function at the position, and a closed function", () => {
    expect(effectsView(effectsUnsupported as FunctionEffectsResult).headline).toBe("No function at this position");
    const closed = effectsView({ ...(effectsOk as FunctionEffectsResult), facts: [], resultHandling: [] });
    expect(closed.headline).toMatch(/^Closed/);
    expect(closed.groups).toEqual([]);
  });

  it("words the via chain", () => {
    expect(viaText([])).toBeNull();
    expect(viaText([{ callable: "row", file: "a.tsx", line: 1 }, { callable: "stamp", file: "b.ts", line: 2 }])).toBe("via row › stamp");
  });
});
