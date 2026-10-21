import { describe, expect, it, vi } from "vitest";
import { segmentedKeyDown } from "./segmentedKeys";

const IDS = ["treemap", "graph", "scatter"] as const;

function press(key: string, current: (typeof IDS)[number], mods: Partial<KeyboardEvent> = {}) {
  const focus = IDS.map(() => vi.fn());
  const event = {
    key,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    ...mods,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { querySelectorAll: () => focus.map((f) => ({ focus: f })) },
  } as unknown as KeyboardEvent;
  const select = vi.fn();
  segmentedKeyDown(event, IDS, current, select);
  return { select, focus, event };
}

describe("segmentedKeyDown", () => {
  it("moves right and left, wrapping at the ends", () => {
    expect(press("ArrowRight", "treemap").select).toHaveBeenCalledWith("graph");
    expect(press("ArrowRight", "scatter").select).toHaveBeenCalledWith("treemap");
    expect(press("ArrowLeft", "treemap").select).toHaveBeenCalledWith("scatter");
    expect(press("ArrowUp", "graph").select).toHaveBeenCalledWith("treemap");
  });

  it("jumps with Home and End and focuses the chosen option", () => {
    const end = press("End", "treemap");
    expect(end.select).toHaveBeenCalledWith("scatter");
    expect(end.focus[2]).toHaveBeenCalled();
    expect(press("Home", "scatter").select).toHaveBeenCalledWith("treemap");
  });

  it("keeps arrows from reaching the graph's own handler", () => {
    const { event } = press("ArrowDown", "treemap");
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("ignores other keys and modified arrows (Alt+arrow is Back/Forward)", () => {
    expect(press("Enter", "graph").select).not.toHaveBeenCalled();
    const alt = press("ArrowLeft", "graph", { altKey: true });
    expect(alt.select).not.toHaveBeenCalled();
    expect(alt.event.stopPropagation).not.toHaveBeenCalled();
  });
});
