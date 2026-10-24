import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FunctionEffectsResult } from "../../src/srcly/contracts/function-effects";
import { functionEffectsOp } from "../../src/srcly/ops/function-effects";
import { createEngineSession } from "../../src/srcly/session";
import { chooseTypescript } from "../../src/srcly/typescript-choice";

const basics = fileURLToPath(new URL("../../examples/effects-basics", import.meta.url));
const srclyClient = fileURLToPath(new URL("../../../client", import.meta.url));

function sessionFor(root: string) {
  const source = path.join(root, "src");
  return createEngineSession({ root, source, tsconfig: null, typescriptFrom: chooseTypescript(root, source).from });
}

/** The line a named case starts on, so the test never pins line numbers. */
function lineOf(root: string, file: string, marker: string): number {
  const index = fs.readFileSync(path.join(root, file), "utf8").split("\n").findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`${marker} is not in ${file}`);
  return index + 1;
}

const summary = (r: FunctionEffectsResult) => ({
  facts: r.facts.map((f) => `${f.kind} ${f.activation}${f.via.length ? ` via ${f.via.map((v) => v.callable).join(">")}` : ""}`),
  frontiers: r.frontiers.map((f) => f.reason),
  handling: r.resultHandling.map((h) => `${h.callee} ${h.handling}`),
});

describe("functionEffects on effects-basics (the 21 cases)", () => {
  const session = sessionFor(basics);
  const effects = (marker: string) => functionEffectsOp(session, { file: "src/cases.ts", line: lineOf(basics, "src/cases.ts", marker) });

  it("1 a closed leaf has no facts and no frontiers", () => {
    const r = effects("export function closedLeaf");
    expect(r.outcome).toBe("ok");
    expect(summary(r)).toEqual({ facts: [], frontiers: [], handling: [] });
    expect(r.coverage).toBe("complete-for-supported-scope");
    expect(r.callable).toMatchObject({ name: "closedLeaf", kind: "function", async: false });
  });

  it("2 an imported leaf is followed and adds nothing", () => {
    const r = effects("export function callsImportedLeaf");
    expect(summary(r)).toEqual({ facts: [], frontiers: [], handling: [] });
    expect(r.counts.callables).toBe(2);
  });

  it("3 and 4 a direct call and an alias both carry the helper's output, via the helper", () => {
    expect(summary(effects("export function directCall")).facts).toEqual(["stdout direct via logIt"]);
    expect(summary(effects("export function aliasCall")).facts).toEqual(["stdout direct via aliasOfLogIt"]);
  });

  it("5 and 6 sort writes a parameter, not a fresh slice", () => {
    expect(summary(effects("export function freshSliceThenSort")).facts).toEqual([]);
    expect(summary(effects("export function inputAliasThenSort")).facts).toEqual([]);
  });

  it("7 and 8 a transitive parameter write is the caller's; a write to a fresh object is partial", () => {
    const transitive = effects("export function transitiveParameterWrite");
    expect(transitive.facts.map((f) => [f.kind, f.status, f.via.map((v) => v.callable)])).toEqual([["parameter-write", "proven", ["stamp"]]]);
    const fresh = effects("export function freshThenBorrowedChildWrite");
    expect(fresh.facts.map((f) => [f.kind, f.status])).toEqual([["fresh-write", "partial"]]);
  });

  it("9 to 12 activation: a returned arrow is latent, an IIFE direct, a timer callback timer, a promise executor direct with its settle", () => {
    expect(summary(effects("export function latentReturnedArrow")).facts).toEqual(["stdout latent"]);
    expect(summary(effects("export function iife"))).toEqual({ facts: ["stdout direct"], frontiers: [], handling: [] });
    expect(summary(effects("export function timer")).facts).toEqual(["timer direct", "stdout timer"]);
    expect(summary(effects("export function promiseExecutor")).facts).toEqual(["promise-executor direct", "stdout direct", "promise-settle direct"]);
  });

  it("13 to 16 awaits and how a promise is handled", () => {
    expect(summary(effects("export async function asyncLogAfterAwait"))).toEqual({ facts: ["await direct", "network-request direct", "stdout after-await"], frontiers: [], handling: ["fetch awaited"] });
    expect(summary(effects("export function discardedPromise")).handling).toEqual(["fetch discarded"]);
    expect(summary(effects("export async function awaitedPromise")).handling).toEqual(["fetch awaited"]);
    expect(summary(effects("export function returnedPromise")).handling).toEqual(["fetch returned"]);
  });

  it("17 and 18 identity, never a name: a local arrow called fetch is first party, a parameter called fetch is a callback frontier", () => {
    expect(summary(effects("export function localArrowNamedFetch"))).toEqual({ facts: [], frontiers: [], handling: [] });
    expect(summary(effects("export function parameterNamedFetch"))).toEqual({ facts: [], frontiers: ["callback-parameter"], handling: [] });
  });

  it("19 a log then an unknown callback: a fact and a frontier together", () => {
    expect(summary(effects("export function logThenUnknownCallback"))).toEqual({ facts: ["stdout direct"], frontiers: ["callback-parameter"], handling: [] });
  });

  it("20 mutual recursion: each side carries the other's facts once and names the cycle", () => {
    const ping = summary(effects("export function pingWrites"));
    expect(ping.facts).toEqual(["module-write direct", "module-read direct via pongReads"]);
    expect(ping.frontiers).toEqual(["recursion"]);
    const pong = summary(effects("export function pongReads"));
    expect(pong.facts).toEqual(["module-read direct", "module-write direct via pingWrites"]);
    expect(pong.frontiers).toEqual(["recursion"]);
  });

  it("21 filesystem read and write, a module write, a throw: every fact has a witness on its own line", () => {
    const r = effects("export function fileRoundTrip");
    expect(summary(r).facts).toEqual(["filesystem-read direct", "filesystem-write direct", "module-write direct", "module-read direct", "throw direct"]);
    const start = lineOf(basics, "src/cases.ts", "export function fileRoundTrip");
    expect(r.facts.map((f) => f.witness.line - start)).toEqual([1, 2, 3, 3, 4]);
    expect(r.facts.every((f) => f.witness.text.length > 0 && f.witness.file === "src/cases.ts")).toBe(true);
    expect(r.assumptions.length).toBeGreaterThan(0);
  });

  it("names a position outside any function as unsupported", () => {
    const r = functionEffectsOp(session, { file: "src/cases.ts", line: 1 });
    expect(r).toMatchObject({ outcome: "unsupported", reason: "no-callable", coverage: "not-analyzed" });
  });
});

describe.skipIf(!fs.existsSync(path.join(srclyClient, "src/services/scanJobs.ts")))("functionEffects on srcly's own client (M6 acceptance)", () => {
  const session = sessionFor(srclyClient);

  it("extractFilePath is closed under the intrinsic assumptions", () => {
    const r = functionEffectsOp(session, { file: "src/utils/dataProcessing.ts", line: lineOf(srclyClient, "src/utils/dataProcessing.ts", "export function extractFilePath") });
    expect(r.outcome).toBe("ok");
    expect(summary(r)).toEqual({ facts: [], frontiers: [], handling: [] });
  }, 120_000);

  it("rankHotSpots reads the module-level byId through metricDef", () => {
    const r = functionEffectsOp(session, { file: "src/utils/hotSpotRanking.ts", line: lineOf(srclyClient, "src/utils/hotSpotRanking.ts", "export function rankHotSpots") });
    expect(r.facts.map((f) => [f.kind, f.label, f.via.map((v) => v.callable)])).toEqual([["module-read", "byId", ["metricDef"]]]);
  }, 120_000);

  it("startScan: a network witness, one direct await, the returned promise adopted from expectJson with its awaits and throw", () => {
    const r = functionEffectsOp(session, { file: "src/services/scanJobs.ts", line: lineOf(srclyClient, "src/services/scanJobs.ts", "export async function startScan") });
    expect(summary(r)).toEqual({
      facts: ["await direct", "network-request direct", "await after-await via expectJson", "throw after-await via expectJson", "await after-await via expectJson"],
      frontiers: [],
      handling: ["fetch awaited", "expectJson returned"],
    });
    expect(r.facts.find((f) => f.kind === "network-request")?.witness.text).toMatch(/^fetch\("\/api\/scans"/);
  }, 120_000);
});
