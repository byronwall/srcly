/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyFlowDecorations } from "./flowDecorations";

describe("applyFlowDecorations", () => {
  it("wraps an identifier range inside span.line and preserves the line structure", () => {
    const html =
      '<pre class="shiki"><code><span class="line">const x = y;</span></code></pre>';

    const out = applyFlowDecorations(
      html,
      [
        {
          fileLine: 1,
          startCol: 6,
          endCol: 7,
          category: "local",
          symbolId: "s1",
          tooltip: "Local",
        },
      ],
      { sliceStartLine: 1, removedIndentByLine: null }
    );

    const doc = new DOMParser().parseFromString(out, "text/html");
    expect(doc.querySelectorAll("span.line")).toHaveLength(1);

    const flow = doc.querySelector(".flow") as HTMLElement | null;
    expect(flow).not.toBeNull();
    expect(flow!.textContent).toBe("x");
    expect(flow!.dataset.sym).toBe("s1");
  });

  it("supports multiple tokens on the same line (right-to-left insertion)", () => {
    const html =
      '<pre class="shiki"><code><span class="line">const x = y;</span></code></pre>';

    const out = applyFlowDecorations(
      html,
      [
        {
          fileLine: 1,
          startCol: 6,
          endCol: 7,
          category: "local",
          symbolId: "sx",
          tooltip: "x",
        },
        {
          fileLine: 1,
          startCol: 10,
          endCol: 11,
          category: "param",
          symbolId: "sy",
          tooltip: "y",
        },
      ],
      { sliceStartLine: 1, removedIndentByLine: null }
    );

    const doc = new DOMParser().parseFromString(out, "text/html");
    expect(doc.querySelectorAll(".flow")).toHaveLength(2);
    expect(doc.querySelector('[data-sym="sx"]')?.textContent).toBe("x");
    expect(doc.querySelector('[data-sym="sy"]')?.textContent).toBe("y");
  });
});


