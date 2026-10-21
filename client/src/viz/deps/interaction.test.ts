import { describe, expect, it } from "vitest";
import { clickAction, createClickIntent, liveHover, nextInDirection } from "./interaction";

describe("liveHover", () => {
  const ids = new Set(["a", "b"]);

  it("keeps an id the layout still contains", () => {
    expect(liveHover(ids, "a")).toBe("a");
  });

  it("drops a stale id left over from the previous layout", () => {
    expect(liveHover(ids, "gone")).toBeNull();
    expect(liveHover(ids, null)).toBeNull();
  });
});

/** A manual clock: timers run only when `advance` passes their due time. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  return {
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    cancel: (id: unknown) => {
      timers = timers.filter((t) => t.id !== id);
    },
    advance(ms: number) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      timers = timers.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    },
  };
}

function setup() {
  const clock = fakeClock();
  const log: string[] = [];
  const intent = createClickIntent<string>({
    onFocus: (t) => log.push(`focus:${t}`),
    onOpen: (t) => log.push(`open:${t}`),
    windowMs: 220,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { clock, log, intent };
}

describe("createClickIntent", () => {
  it("focuses only after the double-click window passes", () => {
    const { clock, log, intent } = setup();
    intent.click("a");
    clock.advance(200);
    expect(log).toEqual([]);
    clock.advance(30);
    expect(log).toEqual(["focus:a"]);
  });

  it("opens on a second click inside the window, without focusing", () => {
    const { clock, log, intent } = setup();
    intent.click("a");
    clock.advance(120);
    intent.click("a");
    clock.advance(500);
    expect(log).toEqual(["open:a"]);
  });

  it("treats clicks on two different targets as two focuses, last one wins", () => {
    const { clock, log, intent } = setup();
    intent.click("a");
    clock.advance(100);
    intent.click("b");
    clock.advance(500);
    expect(log).toEqual(["focus:b"]);
  });

  it("opens at once on ⌘/Ctrl-click and on middle-click", () => {
    const { clock, log, intent } = setup();
    intent.click("a", { metaKey: true });
    intent.click("b", { ctrlKey: true });
    intent.auxClick("c", 1);
    intent.auxClick("d", 2); // right button: ignored
    clock.advance(500);
    expect(log).toEqual(["open:a", "open:b", "open:c"]);
  });

  it("a middle-click cancels a pending focus", () => {
    const { clock, log, intent } = setup();
    intent.click("a");
    intent.auxClick("a", 1);
    clock.advance(500);
    expect(log).toEqual(["open:a"]);
  });

  it("cancel drops a pending focus", () => {
    const { clock, log, intent } = setup();
    intent.click("a");
    intent.cancel();
    clock.advance(500);
    expect(log).toEqual([]);
  });
});

describe("nextInDirection", () => {
  const box = (id: string, x: number, y: number) => ({ id, x, y, width: 100, height: 40 });
  // a  b  c
  // d     e
  const rects = [box("a", 0, 0), box("b", 150, 0), box("c", 300, 10), box("d", 0, 80), box("e", 300, 90)];

  it("moves to the nearest box in line first", () => {
    expect(nextInDirection(rects, "a", "right")).toBe("b");
    expect(nextInDirection(rects, "b", "right")).toBe("c");
    expect(nextInDirection(rects, "a", "down")).toBe("d");
    expect(nextInDirection(rects, "c", "down")).toBe("e");
    expect(nextInDirection(rects, "d", "right")).toBe("e");
  });

  it("stops at the edge and on unknown ids", () => {
    expect(nextInDirection(rects, "a", "left")).toBeNull();
    expect(nextInDirection(rects, "a", "up")).toBeNull();
    expect(nextInDirection(rects, "zz", "up")).toBeNull();
  });
});

describe("clickAction", () => {
  const folder = { graphId: "src/app", kind: "folder", expandable: true };
  const inFrame = { graphId: "src/app/a.ts", kind: "file", group: { id: "src/app", label: "app" } };
  const opts = { shift: false, focusId: "src", collapsible: (id: string) => id === "src/app" };

  it("focuses on a plain click, even a folder that could open in place", () => {
    expect(clickAction(folder, opts).kind).toBe("focus");
    expect(clickAction({ graphId: "a.ts#run", kind: "symbol" }, opts).kind).toBe("isolate");
  });

  it("does nothing on a plain click of the focus itself", () => {
    expect(clickAction({ ...folder, graphId: "src" }, opts).kind).toBe("none");
  });

  it("opens in place on Shift-click, or closes the opened folder around it", () => {
    expect(clickAction(folder, { ...opts, shift: true }).kind).toBe("expand");
    expect(clickAction(inFrame, { ...opts, shift: true })).toEqual({ kind: "collapse", frame: "app" });
    expect(clickAction({ graphId: "b.ts", kind: "file" }, { ...opts, shift: true }).kind).toBe("none");
  });
});
