import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args";
import { buildRouteDataInventory } from "../src/api/projections/route-data";
import { projectRouteTotality } from "../src/api/projections/route-totality";
import type { RouteTotality } from "../src/api/route-totality-contracts";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";
import type { RouteTotalityRecord } from "../src/analysis/route-data-totality";
import { analyzeProject } from "../src/core";

const soccerAppRoot = "/Users/byronwall/Projects/soccer-schedule/app";
// The soccer app is a local checkout that keeps changing. Run these proofs
// only when it exists and the pinned readFile source is still on line 96.
const hasSoccerApp = fs.existsSync(soccerAppRoot)
  && fs.readFileSync(`${soccerAppRoot}/src/lib/soccer/store-persistence.ts`, "utf8").split("\n")[95]?.includes("readFile") === true;
const sourceFile = "src/lib/soccer/store-persistence.ts";
const sourceLine = 96;

const filterForLedger = [
  "source-carrier",
  "property-read",
  "filter-element",
  "filter-callback-parameter",
  "filter-predicate-return",
  "filter-result",
  "function-return",
  "component-boundary",
  "for-element",
  "for-callback-parameter",
  "for-property-read",
  "occurrence-consumer",
] as const;

const dependencyLedger = [
  "source-carrier",
  "property-read",
  "cross-filter-element",
  "cross-filter-callback-parameter",
  "cross-filter-predicate-return",
  "cross-filter-result",
  "cross-map-element",
  "cross-map-callback-parameter",
  "cross-map-property-read",
  "cross-map-result",
  "cross-function-return",
  "cross-join-source",
  "cross-join-filter-element",
  "cross-join-filter-callback-parameter",
  "cross-join-membership",
  "cross-join-filter-result",
] as const;

const directFieldLedger = [
  "source-carrier",
  "property-read",
  "find-element",
  "callback-parameter",
  "predicate-return",
  "find-result",
  "function-return",
  "show-when",
  "show-render-prop",
  "accessor-call",
  "nested-property-read",
  "occurrence-consumer",
] as const;

let record: RouteTotalityRecord;
let totality: RouteTotality;

beforeAll(async () => {
  if (!hasSoccerApp) return;
  const report = await analyzeProject(parseArgs([
    "--root", soccerAppRoot,
    "--source", "src",
    "--tsconfig", "tsconfig.json",
    "--typescript-from", process.cwd(),
    "--format", "json",
    "--view", "work-packets",
  ]));
  const inventory = buildRouteDataInventory(report);
  const route = inventory.routes.find((item) => item.pathPattern === "/games/[gameId]/schedule");
  if (!route) throw new Error("The schedule route is missing from the soccer fixture.");
  const sources = inventory.sources.filter((source) => (
    source.routeKeys.includes(route.key)
      && source.file === sourceFile
      && source.line === sourceLine
  ));
  if (sources.length !== 1) {
    throw new Error(`Expected one schedule source at ${sourceFile}:${sourceLine}, found ${sources.length}.`);
  }
  const source = sources[0];
  const evidence = report.routeData.evidence.find((item) => item.id === source.evidenceId);
  if (!evidence?.programElementId) throw new Error("The schedule source lacks exact compiler evidence.");

  const selected = {
    key: source.key,
    evidence: {
      id: evidence.id,
      elementId: evidence.programElementId,
      file: evidence.file,
      line: evidence.line,
      column: evidence.column,
      span: evidence.span,
    },
  };
  const result = routeTotalityForRoute(report.routeData, route.key, selected);
  if (!result) throw new Error("The schedule route has no selected-source totality record.");
  const projection = projectRouteTotality(result);
  if (!projection) throw new Error("The schedule route totality projection is unavailable.");
  record = result;
  totality = projection;
});

function displayNameAttachment() {
  const matches = totality.fieldLineage.attachments.filter((attachment) => (
    attachment.field.label === "players[*].displayName"
      && attachment.consumer?.label === "Text displayName"
  ));
  expect(matches).toHaveLength(1);
  return matches[0];
}

function availableEvidence() {
  if (!("elements" in totality.evidenceSlice)) throw new Error("Expected an available evidence slice.");
  return totality.evidenceSlice;
}

describe.skipIf(!hasSoccerApp)("schedule route selected-source field proof", () => {
  it("materializes lazy filter and For evidence before anchoring", () => {
    const attachment = displayNameAttachment();
    const consumer = attachment.consumer;
    if (!consumer) throw new Error("The display-name attachment has no consumer.");
    if (!("terminals" in totality.occurrenceSurface)) throw new Error("Expected an available occurrence surface.");
    const evidence = availableEvidence();

    expect(attachment.transformationKinds).toEqual(filterForLedger);
    const transformationsById = new Map(totality.fieldLineage.transformations.map((item) => [item.id, item]));
    const transformations = attachment.transformationIds.map((id) => transformationsById.get(id));
    expect(transformations.every(Boolean)).toBe(true);
    const resolvedTransformations = transformations.filter((item): item is NonNullable<typeof item> => Boolean(item));
    expect(resolvedTransformations.map((item) => item.kind)).toEqual(attachment.transformationKinds);
    for (const transformation of resolvedTransformations) {
      expect(transformation.status).toBe("proven");
      expect(transformation.proof.length).toBeGreaterThan(0);
      expect(transformation.proof.every((proof) => proof.status === "proven")).toBe(true);
      const relationIds = [...transformation.evidenceRelationIds, ...transformation.supportingRelationIds];
      for (const relationId of relationIds) {
        const relations = evidence.relations.filter((relation) => relation.id === relationId);
        expect(relations).toHaveLength(1);
        expect(relations[0]).toMatchObject({
          status: "proven",
          proof: { status: "proven" },
        });
      }
    }
    expect(attachment.terminalIds).toHaveLength(1);
    expect(totality.occurrenceSurface.terminals.filter((terminal) => (
      terminal.id === attachment.terminalIds[0]
        && terminal.ownerOccurrenceId === attachment.occurrenceId
    ))).toHaveLength(1);

    const terminalRelations = evidence.relations.filter((relation) => (
      relation.id === consumer.fieldLineageTerminalRelationId
        && relation.from === consumer.elementId
        && relation.to === consumer.fieldLineageTerminalElementId
        && relation.kind === "render-terminal"
        && relation.proof.kind === "field-consumer-terminal"
        && relation.status === "proven"
        && relation.proof.status === "proven"
    ));
    expect(terminalRelations).toHaveLength(1);
  });

  it("keeps collection membership in a separate exact dependency ledger", () => {
    const attachment = displayNameAttachment();
    const consumer = attachment.consumer;
    if (!consumer) throw new Error("The display-name attachment has no consumer.");
    expect(attachment.dependencies).toHaveLength(1);
    const dependency = attachment.dependencies[0];
    expect(dependency).toMatchObject({
      kind: "collection-membership",
      sourceField: { label: "availability[*].playerId" },
      target: {
        attachmentId: attachment.id,
        consumerId: consumer.id,
        terminalId: attachment.terminalIds[0],
        terminalRelationId: consumer.fieldLineageTerminalRelationId,
        targetKey: consumer.target.targetKey,
      },
    });

    const transformationsById = new Map(totality.fieldLineage.transformations.map((item) => [item.id, item]));
    const transformations = dependency.sourceTransformationIds.map((id) => transformationsById.get(id));
    expect(transformations.every(Boolean)).toBe(true);
    const resolvedTransformations = transformations.filter((item): item is NonNullable<typeof item> => Boolean(item));
    expect(resolvedTransformations.map((item) => item.kind)).toEqual(dependencyLedger);
    expect(dependency.sourceEvidencePathRelationIds).toEqual(
      resolvedTransformations.flatMap((item) => item.evidenceRelationIds),
    );

    const evidence = availableEvidence();
    const relationsById = new Map(evidence.relations.map((relation) => [relation.id, relation]));
    const canonicalElementIds = [attachment.origin.elementId];
    for (const transformation of resolvedTransformations) {
      for (const relationId of transformation.evidenceRelationIds) {
        const relation = relationsById.get(relationId);
        if (!relation) throw new Error(`Dependency relation ${relationId} is missing.`);
        if (canonicalElementIds.at(-1) !== relation.from) canonicalElementIds.push(relation.from);
        canonicalElementIds.push(relation.to);
      }
    }
    expect(dependency.sourceEvidencePathElementIds).toEqual(canonicalElementIds);
    const evidenceElementsById = new Map(evidence.elements.map((element) => [element.id, element]));
    const exactSourceFieldTargets = [
      ["property-read", "field-read"],
      ["cross-filter-element", "collection-element"],
      ["cross-map-property-read", "field-read"],
    ].map(([transformationKind, elementKind]) => {
      const matching = resolvedTransformations.filter((item) => (
        item.kind === transformationKind
          && evidenceElementsById.get(item.toElementIds[0])?.kind === elementKind
      ));
      expect(matching).toHaveLength(1);
      return matching[0].toElementIds[0];
    });
    expect(dependency.sourceField.elementIds).toEqual(exactSourceFieldTargets);
    expect(dependency.sourceField.segments).toEqual([
      { kind: "property", value: "availability" },
      { kind: "collection-element", value: "*" },
      { kind: "property", value: "playerId" },
    ]);
    expect(exactSourceFieldTargets.every((id) => canonicalElementIds.includes(id))).toBe(true);
  });

  it("projects incomplete candidates as typed null-field frontiers", () => {
    const rawFrontiers = record.fieldLineage.frontiers;
    expect(rawFrontiers.length).toBeGreaterThan(0);
    const transformationsById = new Map(totality.fieldLineage.transformations.map((item) => [item.id, item]));
    const frontiers = totality.fieldLineage.frontiers;
    expect(frontiers).toHaveLength(rawFrontiers.length);
    expect(frontiers.map((frontier) => frontier.id).sort()).toEqual(
      rawFrontiers.map((frontier) => frontier.id).sort(),
    );

    for (const frontier of frontiers) {
      expect(frontier.field).toBeNull();
      expect(frontier.occurrenceId).toBeNull();
      expect(frontier.origin).toMatchObject({ role: "filesystem" });
      expect(frontier.origin.selectedEvidenceId).toBeTruthy();
      expect(frontier.missingTransformationKind).toBeTruthy();
      const acceptedKinds = frontier.transformationIds.map((id) => transformationsById.get(id)?.kind);
      expect(acceptedKinds.every(Boolean)).toBe(true);
      expect([...acceptedKinds, frontier.missingTransformationKind]).toEqual(
        directFieldLedger.slice(0, acceptedKinds.length + 1),
      );
    }

    expect(frontiers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: null,
        reason: "partial-proof",
        missingTransformationKind: "accessor-call",
      }),
      expect.objectContaining({
        field: null,
        reason: "ambiguous-target",
        missingTransformationKind: "source-carrier",
        transformationIds: [],
      }),
    ]));
  });
});
