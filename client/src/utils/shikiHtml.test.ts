import { describe, expect, it } from "vitest";
import {
  applyLineNumberCounterReset,
  decorateShikiHtmlForRange,
  markNonFocusLines,
  stripShikiPreNewlines,
} from "./shikiHtml";

describe("shikiHtml helpers", () => {
  it("stripShikiPreNewlines removes newline before line spans", () => {
    const input =
      '<pre class="shiki"><code>\n<span class="line">a</span>\n<span class="line">b</span></code></pre>';
    const out = stripShikiPreNewlines(input);
    expect(out).toContain('<code><span class="line">a</span><span class="line">b</span>');
  });

  it("applyLineNumberCounterReset injects counter-reset style", () => {
    const input = '<pre class="shiki"><code class="language-ts">x</code></pre>';
    const out = applyLineNumberCounterReset(input, 41);
    expect(out).toContain('counter-reset: line 41');
  });

  it("markNonFocusLines adds non-focus-line outside focus range", () => {
    const input =
      '<pre class="shiki"><code><span class="line">a</span><span class="line">b</span><span class="line">c</span></code></pre>';
    const out = markNonFocusLines(input, 2, 2);
    expect(out).toContain('<span class="line non-focus-line">a</span>');
    expect(out).toContain('<span class="line">b</span>');
    expect(out).toContain('<span class="line non-focus-line">c</span>');
  });

  it("decorateShikiHtmlForRange composes all decorations", () => {
    const input =
      '<pre class="shiki"><code>\n<span class="line">a</span>\n<span class="line">b</span></code></pre>';
    const out = decorateShikiHtmlForRange(input, {
      sliceStartLine: 10,
      focusStartIndex: 2,
      focusEndIndex: 2,
    });
    expect(out).toContain("counter-reset: line 9");
    expect(out).toContain("non-focus-line");
    expect(out).not.toContain("\n<span");
  });
});


