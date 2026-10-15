import { describe, expect, it } from "vitest";
import { HistoryRing, shortAge } from "./history";
import type { Location } from "./location";

const loc = (at: string, view: Location["view"] = "treemap", repo = "/r"): Location => ({ repo, at, view });

describe("HistoryRing", () => {
  it("lists visits newest first", () => {
    const ring = new HistoryRing();
    ring.record(loc("a"), 1);
    ring.record(loc("b"), 2);
    expect(ring.entries().map((e) => e.loc.at)).toEqual(["b", "a"]);
  });

  it("moves a revisited place to the top instead of duplicating it", () => {
    const ring = new HistoryRing();
    ring.record(loc("a"), 1);
    ring.record(loc("b"), 2);
    ring.record(loc("a"), 3);
    expect(ring.entries()).toEqual([
      { loc: loc("a"), time: 3 },
      { loc: loc("b"), time: 2 },
    ]);
  });

  it("treats the same path in another view or repo as a different place", () => {
    const ring = new HistoryRing();
    ring.record(loc("a"), 1);
    ring.record(loc("a", "graph"), 2);
    ring.record(loc("a", "treemap", "/other"), 3);
    expect(ring.entries()).toHaveLength(3);
  });

  it("keeps at most `capacity` places", () => {
    const ring = new HistoryRing(3);
    for (let i = 0; i < 5; i++) ring.record(loc(`p${i}`), i);
    expect(ring.entries().map((e) => e.loc.at)).toEqual(["p4", "p3", "p2"]);
  });

  it("does not alias the recorded location", () => {
    const ring = new HistoryRing();
    const l = loc("a");
    ring.record(l, 1);
    l.at = "mutated";
    expect(ring.entries()[0].loc.at).toBe("a");
  });

  it("round-trips through JSON and drops malformed entries", () => {
    const ring = new HistoryRing();
    ring.record(loc("a"), 1);
    ring.record(loc("b", "graph"), 2);
    const back = HistoryRing.fromJSON(JSON.parse(JSON.stringify(ring)));
    expect(back.entries()).toEqual(ring.entries());
    const bad = HistoryRing.fromJSON([{ time: 1 }, null, { loc: { repo: "/r", at: "x", view: "pie" }, time: 1 }, { loc: loc("ok"), time: 4 }]);
    expect(bad.entries().map((e) => e.loc.at)).toEqual(["ok"]);
    expect(HistoryRing.fromJSON("nope").entries()).toEqual([]);
  });
});

describe("shortAge", () => {
  it("formats compact ages", () => {
    expect(shortAge(0, 5_000)).toBe("now");
    expect(shortAge(0, 45_000)).toBe("45s");
    expect(shortAge(0, 12 * 60_000)).toBe("12m");
    expect(shortAge(0, 3 * 3_600_000)).toBe("3h");
    expect(shortAge(0, 49 * 3_600_000)).toBe("2d");
    expect(shortAge(10, 0)).toBe("now");
  });
});
