// Every graph op in every result shape the fake engine answers in (T5). The
// shapes come from server/tests/snapshots, written by
// server/tests/test_dataflow_outcomes.py from the emitted JSON Schemas, so the
// server and the client read one table. Each shape must reach the UI's pure
// models without throwing, and every outcome must have its status-line text.
import { describe, expect, it } from "vitest";
import anchorOk from "../../../server/tests/snapshots/fake-engine.anchorGraph.ok.json";
import anchorPartial from "../../../server/tests/snapshots/fake-engine.anchorGraph.partial.json";
import anchorUnsupported from "../../../server/tests/snapshots/fake-engine.anchorGraph.unsupported.json";
import routeOk from "../../../server/tests/snapshots/fake-engine.routeGraph.ok.json";
import routePartial from "../../../server/tests/snapshots/fake-engine.routeGraph.partial.json";
import routeUnsupported from "../../../server/tests/snapshots/fake-engine.routeGraph.unsupported.json";
import ledgerOk from "../../../server/tests/snapshots/fake-engine.valueFlow.ok.json";
import ledgerPartial from "../../../server/tests/snapshots/fake-engine.valueFlow.partial.json";
import ledgerUnsupported from "../../../server/tests/snapshots/fake-engine.valueFlow.unsupported.json";
import { routeGraphToViewModel } from "../viz/deps/flow/adapter";
import { anchorGraphToViewModel } from "../viz/deps/flow/anchorAdapter";
import { anchorOverview, routeOverview } from "../viz/deps/flow/inspectorModel";
import type { Outcome } from "./api";
import type { AnchorGraphResult, RouteGraphResult, ValueFlowResult } from "./contract.generated";
import { labelFor } from "./outcome";

const SHAPES = ["ok", "partial", "unsupported"] as const;
const routes: Record<(typeof SHAPES)[number], RouteGraphResult> = {
  ok: routeOk as RouteGraphResult,
  partial: routePartial as RouteGraphResult,
  unsupported: routeUnsupported as RouteGraphResult,
};
const anchors: Record<(typeof SHAPES)[number], AnchorGraphResult> = {
  ok: anchorOk as AnchorGraphResult,
  partial: anchorPartial as AnchorGraphResult,
  unsupported: anchorUnsupported as AnchorGraphResult,
};
const ledgers: Record<(typeof SHAPES)[number], ValueFlowResult> = {
  ok: ledgerOk as ValueFlowResult,
  partial: ledgerPartial as ValueFlowResult,
  unsupported: ledgerUnsupported as ValueFlowResult,
};

describe("every outcome has its status-line text", () => {
  const outcomes: Outcome[] = ["ok", "partial", "not-analyzed", "unsupported", "stale", "cancelled", "budget"];
  it.each(outcomes)("%s", (outcome) => {
    const label = labelFor(outcome, outcome === "not-analyzed" ? "engine-crashed" : null, "why");
    if (outcome === "ok" || outcome === "cancelled") expect(label).toBeNull();
    else expect(typeof label).toBe("string");
  });
});

describe("routeGraph in every shape reaches the view model and the inspector", () => {
  it.each(SHAPES)("%s", (shape) => {
    const graph = routes[shape];
    expect(graph.outcome).toBe(shape);
    const m = routeGraphToViewModel(graph);
    expect(m.vm.nodes.length).toBe(graph.nodes.length);
    const overview = routeOverview(graph, m);
    expect(overview.outcome).toBe(shape);
    if (shape === "partial") {
      expect(m.vm.nodes.some((n) => n.status === "partial")).toBe(true);
      expect(overview.gaps.length).toBe(1);
      expect(m.vm.edges.find((e) => !e.id.startsWith("contains:"))?.status ?? "partial").toBe("partial");
    }
    if (shape === "unsupported") {
      expect(overview.unavailableReason).toBe("no-route-component");
      expect(m.vm.nodes[0].status).toBe("unsupported");
    }
  });
});

describe("anchorGraph in every shape reaches the view model and the inspector", () => {
  it.each(SHAPES)("%s", (shape) => {
    const graph = anchors[shape];
    expect(graph.outcome).toBe(shape);
    const m = anchorGraphToViewModel(graph);
    expect(m.vm.nodes.length).toBe(graph.nodes.filter((n) => n.kind !== "scope").length);
    const overview = anchorOverview(graph);
    expect(overview.outcome).toBe(shape);
    if (shape === "partial") expect(m.vm.nodes.some((n) => n.symbolKind === "frontier" && n.outline === "hatched")).toBe(true);
    if (shape === "unsupported") expect(overview.reason).toBe("no-evidence-element");
    // A structural edge is drawn as such, never as proven.
    const structural = m.vm.edges.filter((e) => e.status === "structural");
    expect(structural.every((e) => e.style === "structural" && e.faint)).toBe(true);
  });
});

describe("valueFlow in every shape is a consistent ledger", () => {
  it.each(SHAPES)("%s", (shape) => {
    const ledger = ledgers[shape];
    expect(ledger.outcome).toBe(shape);
    expect(ledger.rows[0].kind).toBe("input");
    const ids = new Set(ledger.rows.map((row) => row.id));
    for (const frontier of ledger.frontiers) expect(ids.has(frontier.rowId)).toBe(true);
    for (const terminal of ledger.terminals) expect(ids.has(terminal)).toBe(true);
    if (shape === "ok") expect(ledger.terminals.length).toBe(1);
    if (shape === "partial") expect(ledger.frontiers[0].reason).toBe("unproven-handoff");
    if (shape === "unsupported") expect(ledger.reason).toBe("no-evidence-element");
  });
});
