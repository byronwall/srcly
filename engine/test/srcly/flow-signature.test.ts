import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FlowScope } from "../../src/srcly/contracts/flow-signature";
import { flowSignatureOp } from "../../src/srcly/ops/flow-signature";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";
import { engineRoot } from "./engine-process";
import { pythonForTests } from "./python-env";

// One small app at two refs (`base`, `head`): the fixture the compare report's "Data-flow changes" is tested on.
const fixture = path.join(engineRoot, "test/srcly/__fixtures__/flow-diff");
const python = pythonForTests();

function typescript(side: "base" | "head") {
  const root = path.join(fixture, side);
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
}

const sessions = { base: typescript("base"), head: typescript("head") };
const scope = (side: "base" | "head", file: string, name: string): FlowScope => {
  const found = flowSignatureOp(sessions[side], { file }).scopes.find((item) => item.name === name);
  if (!found) throw new Error(`${name} is not in ${side}/${file}`);
  return found;
};
const keys = (items: { key: string }[] | null) => items?.map((item) => item.key) ?? null;
/** A signature with its display lines taken out: what the two sides are compared by. */
const keyed = (item: FlowScope) => ({
  status: item.status,
  origins: keys(item.origins),
  ends: keys(item.ends),
  pairs: item.pairs.map((pair) => `${pair.key} [${pair.status}]`),
  reads: keys(item.reads),
  effects: keys(item.effects),
  stops: keys(item.stops),
});

describe("flowSignature reduces each function to keys with no line and no local's name", () => {
  it("pairs each origin with the end it reaches, by kind and field path", () => {
    expect(keyed(scope("base", "src/notes.ts", "saveNote")).pairs).toEqual(["request:request.params.id -> database:db.note.update [ok]"]);
    expect(keyed(scope("head", "src/notes.ts", "saveNote")).pairs).toEqual([
      "request:request.params.id -> database:db.note.update [ok]",
      "request:request.body.title -> database:db.note.update [ok]",
    ]);
    expect(keyed(scope("head", "src/notes.ts", "usageUrl"))).toMatchObject({
      origins: ["environment:process.env.USAGE_KEY", "network:fetch"],
      ends: ["network:fetch"],
      pairs: ["parameter:base -> network:fetch [ok]", "environment:process.env.USAGE_KEY -> network:fetch [ok]"],
    });
  });

  it("is the same for a function that only moved, and for a renamed local", () => {
    for (const name of ["slugify", "orderTotal", "shownPrice"]) {
      const before = scope("base", "src/notes.ts", name);
      const after = scope("head", "src/notes.ts", name);
      expect(keyed(after), name).toEqual(keyed(before));
    }
    expect(scope("base", "src/notes.ts", "slugify").line).not.toBe(scope("head", "src/notes.ts", "slugify").line);
  });

  it("carries the declaration trace's status and the stop that lowered it", () => {
    expect(keyed(scope("base", "src/notes.ts", "handleSubmit"))).toMatchObject({ status: "ok", stops: [] });
    expect(keyed(scope("head", "src/notes.ts", "handleSubmit"))).toMatchObject({ status: "assumed", stops: ["unresolved-callee:track"], ends: ["effect:track", "stdout:console.log"] });
  });

  it("lists effects from functionEffects and parameter reads from the checker's bindings", () => {
    expect(keyed(scope("base", "src/notes.ts", "formatPrice")).effects).toEqual([]);
    expect(keyed(scope("head", "src/notes.ts", "formatPrice")).effects).toEqual(["write/module-write:lastPrice", "input/module-read:lastPrice"]);
    expect(keyed(scope("base", "src/UserCard.tsx", "UserCard")).reads).toEqual(["parameter:props.user.name", "parameter:props.user.email"]);
    expect(keyed(scope("head", "src/UserCard.tsx", "UserCard")).reads).toEqual(["parameter:props.user.name"]);
  });

  it("names what a function's result reaches in another file, and gives a callback's facts to the function around it", () => {
    const rows = scope("head", "src/rows.ts", "loadRows");
    expect(keys(rows.origins)).toEqual(["network:fetch"]);
    expect(rows.ends.map((end) => `${end.key} in ${end.file}`)).toEqual(["network:fetch in src/rows.ts", "render:row.label in src/RowTable.tsx"]);
    const table = flowSignatureOp(sessions.head, { file: "src/RowTable.tsx" });
    expect(table.scopes.map((item) => item.name)).toEqual(["RowTable"]);
    expect(table.scopes[0].pairs.map((pair) => pair.key)).toContain("network:fetch -> render:row.label");
  });

  it("traces only the functions that overlap the asked lines", () => {
    const result = flowSignatureOp(sessions.head, { file: "src/notes.ts", lines: [[15, 16], [44, 44]] });
    expect(result.scopes.map((item) => item.name)).toEqual(["formatPrice", "slugify"]);
    expect(result.skippedScopes).toBe(0);
  });
});

describe.skipIf(!python.python)(`flowSignature on Python (${python.reason})`, () => {
  const session = (side: "base" | "head") => {
    const root = path.join(fixture, side, "api");
    return createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: engineRoot, language: "python", python: python.python });
  };
  const handler = (side: "base" | "head") => flowSignatureOp(session(side), { file: "app/main.py" }).scopes.find((item) => item.name === "create_item")!;

  it("finds a handler's new database read and stdout end, and says reads and effects are not measured", () => {
    expect(keyed(handler("base"))).toEqual({ status: "ok", origins: [], ends: [], pairs: [], reads: null, effects: null, stops: [] });
    expect(keyed(handler("head"))).toEqual({
      status: "ok",
      origins: ["database:connection.execute"],
      ends: ["stdout:print"],
      pairs: ["parameter:name -> stdout:print [ok]"],
      reads: null,
      effects: null,
      stops: [],
    });
  }, 120_000);
});
