// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureViewState, clearPendingViewState, loadViewState, registerViewState, resetViewStateForTests, restoreViewState, saveViewState } from "./viewState";

// The registry Return restores a place from (T17): owners capture what the
// URL does not carry and get it back when the place is returned to, even
// when they mount after the restore.
describe("the view-state registry", () => {
  beforeEach(() => resetViewStateForTests());
  afterEach(() => {
    resetViewStateForTests();
    window.sessionStorage.clear();
  });

  it("captures every owner and hands each its own part back", () => {
    let metric = "complexity";
    let camera: { k: number; x: number; y: number } | null = { k: 1.5, x: 10, y: -4 };
    registerViewState("metrics", { capture: () => ({ metric }), restore: (p: { metric: string }) => (metric = p.metric) });
    registerViewState("graph.view", { capture: () => ({ camera }), restore: (p: { camera: typeof camera }) => (camera = p.camera) });
    const snapshot = captureViewState();
    expect(snapshot.parts).toEqual({ metrics: { metric: "complexity" }, "graph.view": { camera: { k: 1.5, x: 10, y: -4 } } });
    metric = "loc";
    camera = null;
    restoreViewState(snapshot);
    expect(metric).toBe("complexity");
    expect(camera).toEqual({ k: 1.5, x: 10, y: -4 });
  });

  it("keeps a part for an owner that mounts after the restore, for the same place only", () => {
    const snapshot = { search: window.location.search, parts: { "graph.view": { selected: "box:1" } }, at: 1 };
    restoreViewState(snapshot);
    let selected: string | null = null;
    registerViewState("graph.view", { capture: () => ({ selected }), restore: (p: { selected: string }) => (selected = p.selected) });
    expect(selected).toBe("box:1");
    // Taken once: a second owner with the same key starts plain.
    let again: string | null = null;
    registerViewState("graph.view", { capture: () => ({ selected: again }), restore: (p: { selected: string }) => (again = p.selected) });
    expect(again).toBeNull();
    // A pending part for another place is never applied.
    restoreViewState({ ...snapshot, search: "?repo=elsewhere" });
    let other: string | null = null;
    registerViewState("graph.view", { capture: () => ({ selected: other }), restore: (p: { selected: string }) => (other = p.selected) });
    expect(other).toBeNull();
    clearPendingViewState();
  });

  it("survives a failing owner and a broken stored snapshot", () => {
    registerViewState("bad", { capture: () => { throw new Error("no"); }, restore: () => { throw new Error("no"); } });
    registerViewState("fine", { capture: () => 1, restore: () => undefined });
    const snapshot = captureViewState();
    expect(snapshot.parts).toEqual({ fine: 1 });
    expect(() => restoreViewState({ ...snapshot, parts: { bad: 1, fine: 2 } })).not.toThrow();
    saveViewState("t1", snapshot);
    expect(loadViewState("t1")).toEqual(snapshot);
    window.sessionStorage.setItem("srcly-view-t2", "{not json");
    expect(loadViewState("t2")).toBeNull();
    expect(loadViewState("t3")).toBeNull();
  });
});
