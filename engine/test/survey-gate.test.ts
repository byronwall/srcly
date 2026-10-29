import { describe, expect, it } from "vitest";
import { acknowledged, difference, moves, newErrors, summarize, table, type Trace } from "../scripts/survey-gate-moves";

const trace = (name: string, outcome: string, stops: string[] = [], code?: string): Trace => ({
  file: "src/a.ts",
  name,
  outcome,
  ms: 1,
  code,
  stops: stops.map((kind) => ({ kind: "frontier", reason: kind })),
});

describe("survey gate moves", () => {
  const base = { client: summarize([trace("a", "ok"), trace("b", "partial", ["disconnected"]), trace("c", "error", [], "Boom")]) };

  it("lists nothing when the two sides match", () => {
    expect(moves(base, structuredClone(base))).toEqual([]);
    expect(table(base, base)).toContain("Stops: no change.");
  });

  it("lists every move as a delta, and a new error separately", () => {
    const head = { client: summarize([trace("a", "partial", ["disconnected"]), trace("b", "assumed"), trace("c", "error", [], "Boom"), trace("d", "error", [], "Crash")]) };
    expect(moves(base, head)).toEqual([
      "client: traces +1",
      "client: outcome assumed +1",
      "client: outcome error +1",
      "client: outcome ok -1",
      "client: no longer ok src/a.ts#a",
      "client: now assumed src/a.ts#b",
      "client: now errors src/a.ts#d: Crash",
    ]);
    expect(newErrors(base, head)).toEqual(["client: now errors src/a.ts#d: Crash"]);
    const rendered = table(base, head).join("\n");
    expect(rendered).toContain("| Repo | Traces | ok | partial | assumed | error |");
    expect(rendered).toContain("| client | 3 → 4 | 1 → 0 | 1 | 0 → 1 | 1 → 2 |");
  });

  it("names a repo one side could not survey", () => {
    expect(moves(base, {})).toEqual(["client: missing from the head survey"]);
  });

  it("compares two runs' moves regardless of their bases", () => {
    expect(difference(["x", "y"], ["y", "z"])).toEqual({ unexpected: ["z"], missing: ["x"] });
  });
});

describe("survey gate acknowledgement", () => {
  it.each([
    ["Survey moves: three client traces are now ok.", true],
    ["## Summary\n\nStuff.\n\n## Survey moves:\n\nThe new rule ends two traces.", true],
    ["- **Survey moves:** one stop fewer", true],
    ["survey moves: lower case is fine", true],
    ["Survey moves:", false],
    ["No acknowledgement here.", false],
    ["Mentions Survey moves: in a sentence", false],
  ])("%j → %s", (body, expected) => {
    expect(acknowledged(body)).toBe(expected);
  });
});
