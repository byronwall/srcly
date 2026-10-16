import { describe, expect, it } from "vitest";
import { tailPath } from "./TreemapTooltip";

describe("tailPath", () => {
  it("leaves short paths alone", () => {
    expect(tailPath("client/src/viz")).toBe("client/src/viz");
  });

  it("drops leading segments, keeping the nearest parents across both separators", () => {
    const path = "client/src/components/Explorer.tsx › Explorer › <ExplorerContext.Provider> › <For>";
    expect(tailPath(path, 46)).toBe("… › <ExplorerContext.Provider> › <For>");
    expect(tailPath("aaaa/bbbb/cccc/dddd", 12)).toBe("…/cccc/dddd");
  });
});
