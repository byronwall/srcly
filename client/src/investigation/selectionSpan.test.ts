import { describe, expect, it } from "vitest";
import { reduceCommonIndent } from "../utils/indentation";
import { caretColumn } from "./selectionSpan";

describe("caretColumn", () => {
  const raw = ["    <div>", "            {props.node.name}", "    </div>"];

  it("maps a caret in an unreduced line to its raw column", () => {
    expect(caretColumn(raw[1], raw[1], raw[1].indexOf("props"))).toBe(raw[1].indexOf("props") + 1);
  });

  it("adds back the indent the viewer removed", () => {
    const shown = reduceCommonIndent(raw).lines[1];
    expect(shown.length).toBeLessThan(raw[1].length);
    const column = caretColumn(raw[1], shown, shown.indexOf("props"));
    expect(raw[1].slice(column! - 1).startsWith("props.node.name")).toBe(true);
  });

  it("refuses a displayed line that is not the source line", () => {
    expect(caretColumn(raw[1], "something else", 3)).toBeNull();
  });
});
