import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { coverageFor } from "./evidence-slice-coverage";
import { visitTypeScript } from "./route-totality-field-proof-ast";
import { buildRouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteTotalityFieldLineage, RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import type { ProgramElement } from "./scope-seam";
import { discoverFieldProofCandidates, discoverScalarFieldProofCandidates, type FieldProofCandidate } from "./route-totality-field-proof-candidate";
import { searchFieldCarrierPaths, type FieldCarrierPath } from "./route-totality-field-proof-carrier";
import { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { attachFieldDependency, failedFieldProof, mergeProvenFieldProofs, provenFieldProof } from "./route-totality-field-proof-result";
import { assembleCrossCollectionDependencyTransformations, assembleFieldProofTransformations, assembleScalarFieldProofTransformations } from "./route-totality-field-proof-transformations";
import type { FieldProofInput } from "./route-totality-field-proof-types";
import {
  deriveExactFieldTargetPolicy,
  EXACT_FIELD_TRANSFER_KINDS,
  SCALAR_FIELD_TRANSFER_KINDS,
  COMPONENT_FIELD_TRANSFER_KINDS,
  verifyExactFieldTransfer,
  type ExactFieldTransferKind,
} from "./route-totality-field-transfer-verifier";
import { FILTER_FOR_FIELD_TRANSFER_KINDS } from "./route-totality-field-filter-for-policy";
import { CROSS_COLLECTION_DEPENDENCY_FIELD_TRANSFER_KINDS, CROSS_COLLECTION_DEPENDENCY_TERMINAL_KIND, CROSS_COLLECTION_FIELD_TRANSFER_KINDS } from "./route-totality-field-cross-collection-policy";
import { dependencyFrontier, dependencyInput, exactOwnerMatch } from "./route-totality-field-proof-dependency";

/** Query one exact compiler-backed transfer ledger for the selected source. */
export function queryRouteTotalityFieldProof(
  input: FieldProofInput,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  const { ts, program, root, provider, slice, surface, selectedSource } = input;
  const index = new RouteTotalityFieldProofIndex(root, provider, slice);
  const selectedInput = selectedSource.evidence ? index.selectedFilesystemInput(selectedSource.evidence) : { kind: "unresolved" as const };
  if (selectedInput.kind === "unresolved" || !selectedSource.evidence) return null;
  const origin = selectedFilesystemOrigin(index, selectedInput.element, selectedSource.evidence.id);
  if (selectedInput.kind === "ambiguous") {
    augmentSlice(index, cancellation);
    return failedFieldProof(
      origin,
      selectedInput.element,
      "source-carrier",
      [],
      "More than one proven filesystem input occupies the selected evidence span.",
      cancellation,
      "ambiguous-target",
    );
  }
  const discoveredCandidates = discoverFieldProofCandidates(ts, program, root, index, cancellation);
  const discoveredScalarCandidates = discoverScalarFieldProofCandidates(ts, program, index, cancellation);
  const candidates: Array<{ candidate: FieldProofCandidate; anchor: CandidateAnchor }> = [];
  for (const candidate of [...discoveredCandidates, ...discoveredScalarCandidates]) {
    materializeCandidateEvidence(index, candidate, cancellation);
    const anchor = anchorCandidate(index, surface, candidate, cancellation);
    if (anchor) candidates.push({ candidate, anchor });
  }
  const bounded: Array<{ candidate: FieldProofCandidate; anchor: CandidateAnchor; carrier: FieldCarrierPath }> = [];
  const carrierAmbiguousTargets = new Set<string>();
  const carrierMissingTargets = new Set<string>();
  const carrierBudgetTargets = new Set<string>();
  for (const value of candidates) {
    cancellation.throwIfCancelled();
    const search = searchFieldCarrierPaths(index, origin.elementId, value.candidate.collectionField.id, cancellation);
    if (search.kind === "budget-exhausted") carrierBudgetTargets.add(value.candidate.targetKey);
    else if (search.paths.length === 1) bounded.push({ ...value, carrier: search.paths[0] });
    else if (search.paths.length > 1) carrierAmbiguousTargets.add(value.candidate.targetKey);
    else carrierMissingTargets.add(value.candidate.targetKey);
  }
  const candidatesByTarget = new Map<string, typeof bounded[number]>();
  const duplicateTargets = new Set<string>();
  for (const value of bounded) {
    const key = value.candidate.targetKey;
    const existing = candidatesByTarget.get(key);
    if (existing && !sameProofIdentity(existing, value)) {
      duplicateTargets.add(key);
      continue;
    }
    if (!existing) candidatesByTarget.set(key, value);
  }
  const candidateByTarget = new Map<string, typeof candidates[number]>();
  for (const value of candidates) {
    if (!candidateByTarget.has(value.candidate.targetKey)) candidateByTarget.set(value.candidate.targetKey, value);
  }
  const unresolvedTargets = new Set([
    ...duplicateTargets,
    ...carrierAmbiguousTargets,
    ...carrierMissingTargets,
    ...carrierBudgetTargets,
  ]);
  const proofTargets = new Map(
    [...candidatesByTarget.entries()].filter(([targetKey]) => !unresolvedTargets.has(targetKey)),
  );
  if (proofTargets.size === 0 && unresolvedTargets.size === 0) {
    augmentSlice(index, cancellation);
    return failedFieldProof(
      origin,
      candidates[0]?.candidate.collectionField ?? index.byId(origin.elementId),
      "source-carrier",
      [],
      "The selected filesystem evidence has no unique exact carrier chain to an anchored collection field read.",
      cancellation,
      "partial-proof",
    );
  }
  const proofs: RouteTotalityFieldLineage[] = unresolvedFieldProofs(
    origin,
    unresolvedTargets,
    candidateByTarget,
    duplicateTargets,
    carrierAmbiguousTargets,
    carrierMissingTargets,
    carrierBudgetTargets,
    cancellation,
  );
  candidateProofs: for (const selected of [...proofTargets.values()].sort((left, right) => left.candidate.targetKey.localeCompare(right.candidate.targetKey))) {
    const { candidate, carrier, anchor } = selected;
    const assembled = candidate.mode === "scalar"
      ? assembleScalarFieldProofTransformations(index, origin, candidate, carrier, cancellation)
      : assembleFieldProofTransformations(index, origin, candidate, carrier, cancellation);
    const accepted: RouteTotalityFieldTransformation[] = [];
    const expectedKinds = candidate.mode === "scalar"
      ? ["source-carrier", "property-read", "scalar-consumer"]
      : candidate.flow === "filter-for" || candidate.flow === "cross-collection"
      ? [...FILTER_FOR_FIELD_TRANSFER_KINDS]
      : candidate.boundary
      ? componentExpectedKinds(candidate.boundary.mode)
      : [...EXACT_FIELD_TRANSFER_KINDS];
    for (let step = 0; step < expectedKinds.length; step += 1) {
      const transfer = assembled[step];
      if (!transfer) {
        if (!isSupportedExactTransferKind(expectedKinds[step])) {
          continue candidateProofs;
        }
        proofs.push(failedFieldProof(
          origin,
          accepted.length ? index.byId(accepted.at(-1)!.toElementIds[0]) : index.byId(origin.elementId),
          expectedKinds[step] as ExactFieldTransferKind,
          accepted,
          `The exact ${expectedKinds[step]} evidence transfer is missing for ${candidate.consumerLabel}.`,
          cancellation,
          "partial-proof",
        ));
        continue candidateProofs;
      }
      accepted.push(transfer);
    }
    const policy = deriveExactFieldTargetPolicy(accepted, index.graph());
    if (!policy) {
      proofs.push(failedFieldProof(
        origin,
        candidate.consumerField,
        "occurrence-consumer",
        accepted.slice(0, -1),
        `The compiler-backed target policy is incomplete or ambiguous for ${candidate.consumerLabel}.`,
        cancellation,
        "partial-proof",
      ));
      continue candidateProofs;
    }
    for (let step = 0; step < accepted.length; step += 1) {
      const verification = verifyExactFieldTransfer(accepted[step], index.graph(), cancellation, policy);
      if (!verification.ok) {
        if (!isSupportedExactTransferKind(accepted[step].kind)) continue candidateProofs;
        proofs.push(failedFieldProof(
          origin,
          index.byId(accepted[step].fromElementIds[0]),
          accepted[step].kind as ExactFieldTransferKind,
          accepted.slice(0, step),
          verification.detail,
          cancellation,
          "partial-proof",
        ));
        continue candidateProofs;
      }
    }
    let proof = provenFieldProof({
      origin,
      collectionField: candidate.collectionField,
      collectionElement: candidate.mode === "scalar" ? null : candidate.collectionElement,
      consumerField: candidate.consumerField,
      occurrence: candidate.occurrence,
      consumerValue: candidate.directConsumer ? candidate.binding : candidate.consumerValue,
      binding: candidate.binding,
      occurrenceId: anchor.occurrenceId,
      terminalId: anchor.terminalId,
      transformations: accepted,
      partial: !slice.coverage.complete || surface.status !== "complete",
      consumerKind: candidate.consumerKind,
      consumerLabel: candidate.consumerLabel,
      directConsumer: candidate.directConsumer,
      sourceField: candidate.sourceField,
      boundaryMode: candidate.boundary?.mode ?? "direct",
      alias: candidate.boundary?.mode === "scalar-alias"
        ? `${candidate.sourceField?.fieldName ?? ""} -> ${candidate.boundary.propName}`
        : null,
      targetConsumer: policy.targetConsumer,
      fieldLineageTerminalElementId: policy.renderTerminalElementId,
      fieldLineageTerminalRelationId: policy.consumerTerminalRelationId,
      field: candidate.mode === "scalar" ? {
        elementIds: [candidate.collectionField.id],
        segments: [{ kind: "property", value: candidate.collectionField.fieldName! }],
        label: candidate.collectionField.fieldName!,
        location: candidate.collectionField.location,
      } : undefined,
    }, cancellation);
    if (candidate.mode === "collection" && candidate.flow === "cross-collection" && candidate.dependency) {
      const dependencyResult = searchFieldCarrierPaths(index, origin.elementId, candidate.dependency.availabilityField.id, cancellation);
      if (dependencyResult.kind === "budget-exhausted" || dependencyResult.paths.length !== 1) {
        proofs.push(proof);
        proofs.push(dependencyFrontier(
          origin,
          candidate,
          index,
          "source-carrier",
          [],
          dependencyResult.kind === "budget-exhausted"
            ? "The dependency carrier search exhausted its fixed budget."
            : dependencyResult.paths.length > 1
              ? "The dependency source has more than one exact carrier path."
              : `The selected source has no exact carrier path to ${candidate.dependency.availabilityField.fieldName ?? "collection"}[*].${candidate.dependency.mappedField.fieldName ?? "field"}.`,
          cancellation,
          dependencyResult.kind === "budget-exhausted" || dependencyResult.paths.length > 1 ? "ambiguous-target" : "partial-proof",
        ));
        continue candidateProofs;
      }
      const dependencyAssembled = assembleCrossCollectionDependencyTransformations(index, origin, candidate, dependencyResult.paths[0], cancellation);
      const dependencyAccepted: RouteTotalityFieldTransformation[] = [];
      let dependencyFailure: { kind: string; detail: string } | null = null;
      for (let step = 0; step < CROSS_COLLECTION_DEPENDENCY_FIELD_TRANSFER_KINDS.length; step += 1) {
        const transfer = dependencyAssembled[step];
        if (!transfer) {
          dependencyFailure = {
            kind: CROSS_COLLECTION_DEPENDENCY_FIELD_TRANSFER_KINDS[step]!,
            detail: `The exact dependency ${CROSS_COLLECTION_DEPENDENCY_FIELD_TRANSFER_KINDS[step]} evidence transfer is missing.`,
          };
          break;
        }
        const verification = verifyExactFieldTransfer(transfer, index.graph(), cancellation);
        if (!verification.ok) {
          dependencyFailure = { kind: transfer.kind, detail: verification.detail };
          break;
        }
        dependencyAccepted.push(transfer);
      }
      if (dependencyFailure) {
        proofs.push(proof);
        proofs.push(dependencyFrontier(origin, candidate, index, dependencyFailure.kind, dependencyAccepted, dependencyFailure.detail, cancellation));
        continue candidateProofs;
      }
      const ownerMatches = proof.attachments.filter((attachment) => exactOwnerMatch(attachment, candidate, anchor));
      if (ownerMatches.length !== 1) {
        proofs.push(proof);
        proofs.push(dependencyFrontier(origin, candidate, index, CROSS_COLLECTION_DEPENDENCY_TERMINAL_KIND, dependencyAccepted, "The dependency did not match exactly one proven owner attachment.", cancellation));
        continue candidateProofs;
      }
      const crossCandidate = { ...candidate, dependency: candidate.dependency };
      const dependency = dependencyInput(index, origin, crossCandidate, dependencyAccepted, ownerMatches[0]);
      if (!dependency) {
        proofs.push(proof);
        proofs.push(dependencyFrontier(origin, candidate, index, "cross-map-property-read", dependencyAccepted, "The dependency source field lacks one exact collection or mapped property identity.", cancellation));
        continue candidateProofs;
      }
      const attached = attachFieldDependency(proof, ownerMatches[0].id, dependency, dependencyAccepted, cancellation);
      if (!attached.ok) {
        proofs.push(proof);
        proofs.push(dependencyFrontier(origin, candidate, index, CROSS_COLLECTION_DEPENDENCY_TERMINAL_KIND, dependencyAccepted, "The dependency owner attachment was not found after exact owner matching.", cancellation));
        continue candidateProofs;
      }
      proof = attached.lineage;
    }
    proofs.push(proof);
  }
  const unsupported = unsupportedTransformProof(ts, program, index, origin, proofTargets, cancellation);
  if (unsupported) proofs.push(unsupported);
  augmentSlice(index, cancellation);
  return mergeProvenFieldProofs(proofs, !slice.coverage.complete || surface.status !== "complete", cancellation);
}

function materializeCandidateEvidence(
  index: RouteTotalityFieldProofIndex,
  candidate: FieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): void {
  const elements = [candidate.occurrence, candidate.definition, candidate.renderTerminal, candidate.consumerField, candidate.consumerValue, candidate.binding,
    candidate.boundary?.occurrence, candidate.boundary?.binding, candidate.boundary?.receiver, candidate.boundary?.definition,
  ].filter((element): element is ProgramElement => Boolean(element));
  const elementIds = new Set(elements.map((element) => element.id));
  for (const element of elements) {
    index.byId(element.id);
    index.outgoing(element.id, cancellation);
  }
  const sliceElements = new Map(index.slice.elements.map((item) => [item.id, item]));
  const sliceRelations = new Map(index.slice.relations.map((item) => [item.id, item]));
  for (const element of index.materializedElements()) if (elementIds.has(element.id)) sliceElements.set(element.id, element);
  for (const relation of index.materializedRelations()) {
    if (elementIds.has(relation.from) || elementIds.has(relation.to)) {
      sliceRelations.set(relation.id, relation);
      elementIds.add(relation.from);
      elementIds.add(relation.to);
    }
  }
  for (const element of index.materializedElements()) if (elementIds.has(element.id)) sliceElements.set(element.id, element);
  index.slice.elements = [...sliceElements.values()].sort((left, right) => left.id.localeCompare(right.id));
  index.slice.relations = [...sliceRelations.values()].sort((left, right) => left.id.localeCompare(right.id));
  index.slice.coverage = coverageFor(index.slice.elements, index.slice.relations, index.slice.origins, index.slice.terminals, index.slice.gaps, index.slice.coverage.truncation, index.slice.coverage.direction, index.slice.coverage.budget.limit, index.slice.coverage.budget.used, index.slice.coverage.budget.exhausted);
  cancellation.throwIfCancelled();
}

function isSupportedExactTransferKind(kind: string): boolean {
  return EXACT_FIELD_TRANSFER_KINDS.includes(kind as typeof EXACT_FIELD_TRANSFER_KINDS[number])
    || SCALAR_FIELD_TRANSFER_KINDS.includes(kind as typeof SCALAR_FIELD_TRANSFER_KINDS[number])
    || COMPONENT_FIELD_TRANSFER_KINDS.includes(kind as typeof COMPONENT_FIELD_TRANSFER_KINDS[number])
    || FILTER_FOR_FIELD_TRANSFER_KINDS.includes(kind as typeof FILTER_FOR_FIELD_TRANSFER_KINDS[number])
    || CROSS_COLLECTION_FIELD_TRANSFER_KINDS.includes(kind as typeof CROSS_COLLECTION_FIELD_TRANSFER_KINDS[number]);
}

function unresolvedFieldProofs(
  origin: RouteTotalityFieldOrigin,
  unresolvedTargets: ReadonlySet<string>,
  candidateByTarget: ReadonlyMap<string, { candidate: FieldProofCandidate }>,
  duplicateTargets: ReadonlySet<string>,
  carrierAmbiguousTargets: ReadonlySet<string>,
  carrierMissingTargets: ReadonlySet<string>,
  carrierBudgetTargets: ReadonlySet<string>,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage[] {
  return [...unresolvedTargets].sort().flatMap((targetKey) => {
    const value = candidateByTarget.get(targetKey)?.candidate;
    if (!value) return [];
    const reason = duplicateTargets.has(targetKey) || carrierAmbiguousTargets.has(targetKey)
      ? "ambiguous-target" as const
      : carrierBudgetTargets.has(targetKey)
        ? "budget-exhausted" as const
        : "partial-proof" as const;
    const detail = duplicateTargets.has(targetKey)
      ? "The selected evidence has more than one exact proof identity for this obligation."
      : carrierAmbiguousTargets.has(targetKey)
        ? "The selected evidence has more than one exact carrier chain to this consumer."
        : carrierBudgetTargets.has(targetKey)
          ? "The exact carrier search exhausted its fixed state or depth budget; uniqueness is unavailable."
        : "The selected evidence has no exact carrier path to this anchored consumer.";
    return [failedFieldProof(
      origin,
      null,
      "source-carrier",
      [],
      detail,
      cancellation,
      reason,
    )];
  });
}

function unsupportedTransformProof(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  index: RouteTotalityFieldProofIndex,
  origin: RouteTotalityFieldOrigin,
  candidates: Map<string, { candidate: FieldProofCandidate; anchor: CandidateAnchor; carrier: FieldCarrierPath }>,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  for (const { candidate } of candidates.values()) {
    if (candidate.mode === "scalar") continue;
    for (const file of program.getSourceFiles()) {
      if (file.isDeclarationFile) continue;
      let found: { field: ProgramElement; formatter: string } | null = null;
      visitTypeScript(ts, file, (node) => {
        if (found || !ts.isPropertyAccessExpression(node) || !ts.isCallExpression(node.expression)) return;
        const currentCall = index.element(node.expression, "call");
        if (!currentCall || currentCall.symbol !== candidate.currentCall.symbol || currentCall.ownerId !== candidate.currentCall.ownerId) return;
        let parent: TypeScript.Node = node;
        while (parent.parent && !ts.isFunctionLike(parent.parent)) {
          parent = parent.parent;
          if (!ts.isCallExpression(parent) || parent === node.expression || !ts.isIdentifier(parent.expression)) continue;
          const field = index.element(node, "field-read");
          if (field) found = { field, formatter: parent.expression.text };
          return;
        }
      });
      const matched = found as { field: ProgramElement; formatter: string } | null;
      if (!matched) continue;
      const detail = `The generic field grammar stops at unsupported formatter ${matched.formatter}.`;
      return failedFieldProof(origin, index.byId(origin.elementId), "source-carrier", [], detail, cancellation, "partial-proof");
    }
  }
  return null;
}

function componentExpectedKinds(mode: "whole-object" | "scalar-alias"): ExactFieldTransferKind[] {
  return mode === "whole-object"
    ? [...EXACT_FIELD_TRANSFER_KINDS.slice(0, 10), "component-boundary", "component-property-read", "occurrence-consumer"]
    : [...EXACT_FIELD_TRANSFER_KINDS.slice(0, 10), "component-source-field", "component-boundary", "occurrence-consumer"];
}

type CandidateAnchor = { occurrenceId: string; terminalId: string; evidenceElementId: string };

function selectedFilesystemOrigin(
  index: RouteTotalityFieldProofIndex,
  element: NonNullable<ReturnType<RouteTotalityFieldProofIndex["byId"]>>,
  selectedEvidenceId: string,
): RouteTotalityFieldOrigin {
  const key = `${element.id}:filesystem`;
  if (!index.slice.origins.some((origin) => `${origin.elementId}:${origin.role}` === key)) {
    index.slice.origins.push({ elementId: element.id, role: "filesystem", label: element.label, status: element.status, proof: element.proof });
    index.slice.origins.sort((left, right) => `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`));
  }
  return { elementId: element.id, role: "filesystem", selectedEvidenceId };
}

function anchorCandidate(
  index: RouteTotalityFieldProofIndex,
  surface: FieldProofInput["surface"],
  candidate: FieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): CandidateAnchor | null {
  const anchors = buildRouteTotalityAnchorIndex(index.slice, surface, cancellation);
  if (candidate.mode === "scalar") {
    const terminals = anchors.terminalAnchorsByEvidenceElementId.get(candidate.renderTerminal.id) ?? [];
    return terminals.length === 1 && terminals[0].endpoint.ownerOccurrenceId
      ? { occurrenceId: terminals[0].endpoint.ownerOccurrenceId, terminalId: terminals[0].endpoint.id, evidenceElementId: candidate.renderTerminal.id }
      : null;
  }
  if (candidate.directConsumer) {
    const boundaryOccurrence = candidate.boundary?.occurrence ?? null;
    const ownerSymbol = candidate.ownerIdentity;
    const occurrences = ownerSymbol
      ? surface.occurrences.filter((item) => item.scopeSeed === surface.scope.seed && sameCompilerIdentity(item.definitionCompilerIdentity, ownerSymbol))
      : [];
    if (boundaryOccurrence) {
      const occurrence = anchors.occurrenceAnchorsByEvidenceElementId.get(boundaryOccurrence.id) ?? [];
      if (occurrence.length !== 1) return null;
      return componentOccurrenceTerminal(index, surface, occurrence[0], cancellation);
    }
    const routeEntries = occurrences.filter((item) => item.parentOccurrenceId === null);
    if (routeEntries.length > 0) {
      if (routeEntries.length !== 1) return null;
      const anchored = anchors.occurrenceAnchors.filter((anchor) => anchor.endpoint.id === routeEntries[0].id);
      return anchored.length === 1 ? exactRootRenderTerminal(anchors, anchored[0], candidate.renderTerminal.id) : null;
    }
    if (occurrences.length !== 1) return null;
    const anchored = anchors.occurrenceAnchors.filter((anchor) => anchor.endpoint.id === occurrences[0].id);
    return anchored.length === 1 ? componentOccurrenceTerminal(index, surface, anchored[0], cancellation) : null;
  }
  const occurrence = anchors.occurrenceAnchorsByEvidenceElementId.get(candidate.occurrence.id) ?? [];
  return occurrence.length === 1 ? componentOccurrenceTerminal(index, surface, occurrence[0], cancellation) : null;
}

/** Keep the route entry on its already exact compiler terminal; never borrow one for a child occurrence. */
function exactRootRenderTerminal(
  anchors: ReturnType<typeof buildRouteTotalityAnchorIndex>,
  occurrence: ReturnType<typeof buildRouteTotalityAnchorIndex>["occurrenceAnchors"][number],
  evidenceElementId: string,
): CandidateAnchor | null {
  const terminals = anchors.terminalAnchorsByEvidenceElementId.get(evidenceElementId) ?? [];
  return terminals.length === 1 && terminals[0].endpoint.ownerOccurrenceId === occurrence.endpoint.id
    ? { occurrenceId: occurrence.endpoint.id, terminalId: terminals[0].endpoint.id, evidenceElementId }
    : null;
}

function componentOccurrenceTerminal(
  index: RouteTotalityFieldProofIndex,
  surface: FieldProofInput["surface"],
  occurrence: ReturnType<typeof buildRouteTotalityAnchorIndex>["occurrenceAnchors"][number],
  cancellation: AnalysisCancellationToken,
): CandidateAnchor | null {
  const definitionRelations = index.outgoing(occurrence.evidenceElementId, cancellation).filter((relation) => (
    relation.kind === "component-occurrence" && relation.proof.kind === "compiler-symbol"
      && relation.status === "proven" && relation.proof.status === "proven"
  ));
  if (definitionRelations.length !== 1) return null;
  const terminal = index.componentRenderTerminal(occurrence.evidenceElementId, definitionRelations[0].to);
  if (!terminal || terminal.kind !== "render-terminal"
    || terminal.symbol !== index.byId(occurrence.evidenceElementId)?.symbol
    || terminal.attributes?.definitionId !== definitionRelations[0].to) return null;
  const relations = index.outgoing(occurrence.evidenceElementId, cancellation).filter((relation) => (
    relation.kind === "render-terminal" && relation.proof.kind === "component-render-terminal"
      && relation.status === "proven" && relation.proof.status === "proven"
  ));
  if (relations.length !== 1 || relations[0].to !== terminal.id) return null;
  if (!index.slice.terminals.some((item) => item.elementId === terminal.id && item.role === "render")) {
    index.slice.terminals.push({ elementId: terminal.id, role: "render", label: terminal.label, status: "proven", proof: terminal.proof });
    index.slice.terminals.sort((left, right) => `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`));
  }
  const elements = new Map(index.slice.elements.map((item) => [item.id, item]));
  const sliceRelations = new Map(index.slice.relations.map((item) => [item.id, item]));
  elements.set(terminal.id, terminal);
  for (const relation of index.materializedRelations()) {
    if (relation.from === occurrence.evidenceElementId && relation.to === terminal.id) sliceRelations.set(relation.id, relation);
  }
  index.slice.elements = [...elements.values()].sort((left, right) => left.id.localeCompare(right.id));
  index.slice.relations = [...sliceRelations.values()].sort((left, right) => left.id.localeCompare(right.id));
  index.slice.coverage = coverageFor(index.slice.elements, index.slice.relations, index.slice.origins, index.slice.terminals, index.slice.gaps, index.slice.coverage.truncation, index.slice.coverage.direction, index.slice.coverage.budget.limit, index.slice.coverage.budget.used, index.slice.coverage.budget.exhausted);
  const refreshedAnchors = buildRouteTotalityAnchorIndex(index.slice, surface, cancellation);
  const anchorsForTerminal = refreshedAnchors.terminalAnchorsByEvidenceElementId.get(terminal.id) ?? [];
  return anchorsForTerminal.length === 1 && anchorsForTerminal[0].endpoint.ownerOccurrenceId === occurrence.endpoint.id
    ? { occurrenceId: occurrence.endpoint.id, terminalId: anchorsForTerminal[0].endpoint.id, evidenceElementId: terminal.id }
    : null;
}

function sameCompilerIdentity(left: string, right: string): boolean {
  return left === right;
}

function sameProofIdentity(
  left: { candidate: FieldProofCandidate; carrier: FieldCarrierPath },
  right: { candidate: FieldProofCandidate; carrier: FieldCarrierPath },
): boolean {
  if (left.candidate.mode !== right.candidate.mode) return false;
  if (left.candidate.mode === "scalar" || right.candidate.mode === "scalar") {
    return left.candidate.targetKey === right.candidate.targetKey
      && left.candidate.collectionField.id === right.candidate.collectionField.id
      && left.candidate.binding.id === right.candidate.binding.id
      && left.candidate.renderTerminal.id === right.candidate.renderTerminal.id
      && left.carrier.call.id === right.carrier.call.id
      && left.carrier.relations.map((relation) => relation.id).join("\0") === right.carrier.relations.map((relation) => relation.id).join("\0");
  }
  return left.candidate.targetKey === right.candidate.targetKey
    && left.candidate.findResult.id === right.candidate.findResult.id
    && left.candidate.binding.id === right.candidate.binding.id
    && left.candidate.consumerField.id === right.candidate.consumerField.id
    && left.candidate.consumerValue.id === right.candidate.consumerValue.id
    && left.candidate.occurrence.id === right.candidate.occurrence.id
    && left.candidate.renderTerminal.id === right.candidate.renderTerminal.id
    && left.carrier.call.id === right.carrier.call.id
    && left.carrier.relations.map((relation) => relation.id).join("\0") === right.carrier.relations.map((relation) => relation.id).join("\0");
}

function augmentSlice(index: RouteTotalityFieldProofIndex, cancellation: AnalysisCancellationToken): void {
  const slice = index.slice;
  const elements = new Map(slice.elements.map((item) => [item.id, item]));
  const relations = new Map(slice.relations.map((item) => [item.id, item]));
  for (const element of index.materializedElements()) elements.set(element.id, element);
  for (const relation of index.materializedRelations()) relations.set(relation.id, relation);
  slice.elements = [...elements.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.relations = [...relations.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.coverage = coverageFor(slice.elements, slice.relations, slice.origins, slice.terminals, slice.gaps, slice.coverage.truncation, slice.coverage.direction, slice.coverage.budget.limit, slice.coverage.budget.used, slice.coverage.budget.exhausted);
  cancellation.throwIfCancelled();
}
