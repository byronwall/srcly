import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRouteTotalityRecords } from "../../src/analysis/route-data-totality";
import { discoverSolidRouteCandidates } from "../../src/analysis/scope-adapters/solid-route";
import { projectRouteTotality } from "../../src/api/projections/route-totality";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";
import { solidRoute } from "./engine-process";

describe("route totality past its slice budget", () => {
  it("names a budget-exhausted omission and stays partial instead of throwing", () => {
    const session = createEngineSession({ root: solidRoute, source: path.join(solidRoute, "src"), tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
    const tier1 = requireTypescript(session.tier1(), "test");
    const provider = tier1.provider();
    const route = tier1.routes.find((item) => item.pathPattern === "/records")!;
    // The same solid-route candidates, with a slice budget far below what /records needs.
    const candidates = discoverSolidRouteCandidates(tier1.root, { elements: provider.facts.elements, relations: [] }).map((candidate) => ({
      ...candidate,
      defaults: { ...candidate.defaults, boundaryPolicy: { ...candidate.defaults.boundaryPolicy, maxElements: 32, maxRelations: 64 } },
    }));
    const [record] = buildRouteTotalityRecords(tier1.ts, tier1.program, tier1.root, [route], provider, candidates);
    expect(record.evidenceSlice).toMatchObject({ coverage: { complete: false } });

    const totality = projectRouteTotality(record)!;
    expect(totality.status).toBe("partial");
    expect(totality.omissions.filter((omission) => omission.startsWith("budget-exhausted:"))).toHaveLength(1);
    expect(totality.gaps.some((gap) => gap.reason === "budget-exhausted")).toBe(true);
  }, 60_000);
});
