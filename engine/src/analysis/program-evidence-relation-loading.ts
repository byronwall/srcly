import type {
  EvidenceConfidence,
  ProgramEvidenceCollectionStats,
  ProgramEvidenceLocation,
  ProgramProof,
  ProgramRelationKind,
  ProgramEvidenceGap,
} from "./program-evidence";
import {
  CompactRelationIndex,
  createCompactRelationDescriptor,
  type CompactRelationDescriptor,
  type CompactRelationLocationToken,
} from "./program-evidence-connector-index";
import { ProgramFactIndex } from "./program-fact-index";
import { emptyProgramEvidenceCollectionStats } from "./program-evidence-collector-instrumentation";
import type { SliceDirection } from "./scope-seam";
import type { AnalysisCancellationToken } from "./cancellation";

/** The source-backed relation input before it becomes a public relation. */
export type RelationRecipeInput = {
  id: string;
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: ProgramEvidenceLocation[];
  proof: ProgramProof;
  confidence: EvidenceConfidence;
};

/** A deferred relation record. It is not exposed as a ProgramRelation. */
export type RelationRecipe = RelationRecipeInput & { sequence: number };

export type RelationSink = (input: RelationRecipeInput) => void;

/** Deduplicate relation recipes retained for one requested frontier. */
export class RelationRecipeStore {
  private readonly recipes: RelationRecipe[] = [];
  private readonly keys = new Set<string>();

  add(input: RelationRecipeInput): void {
    if (this.keys.has(input.id)) return;
    this.keys.add(input.id);
    this.recipes.push({ ...input, sequence: this.recipes.length });
  }

  get values(): readonly RelationRecipe[] {
    return this.recipes;
  }

  get size(): number {
    return this.recipes.length;
  }
}

export type RelationFrontier = {
  recipes: readonly RelationRecipe[];
  /** Changes when another demanded pass can add a relation to this endpoint. */
  revision?: number;
  relationIndexCount: number;
  sourceFilesVisited: number;
  astUnitsVisited: number;
  partitionsVisited: number;
  recipesExamined: number;
  collectorStats: ProgramEvidenceCollectionStats;
};

/** Cumulative work performed by demand collection for one Program. */
export type ProgramEvidenceDemandStats = {
  collectionElapsedMs: number;
  partitionsVisited: number;
  sourceFilesVisited: number;
  astUnitsVisited: number;
  collectorStats: ProgramEvidenceCollectionStats;
};

export interface RelationFrontierLoader {
  load(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken, returnTo?: string): RelationFrontier;
  currentRevision?(elementId: string): number;
  gaps?(elementId: string): readonly ProgramEvidenceGap[];
  getDemandStats?(): ProgramEvidenceDemandStats | null;
}

/**
 * Materialize only requested endpoints from the index built alongside facts.
 * Fact collection already runs every relation-producing pass; retain its
 * compact descriptors so the first query never repeats those passes.
 */
export class ProgramEvidenceRelationFrontierLoader implements RelationFrontierLoader {
  constructor(
    private readonly factIndex: ProgramFactIndex,
    private readonly index: CompactRelationIndex,
    private readonly demand?: {
      prepare(id: string, direction: SliceDirection, returnTo?: string, cancellation?: AnalysisCancellationToken): void;
      gaps(id: string): readonly ProgramEvidenceGap[];
      getDemandStats?(): ProgramEvidenceDemandStats | null;
    },
  ) {}

  currentRevision(elementId?: string): number {
    return elementId === undefined
      ? this.index.size + this.factIndex.factCount
      : this.index.revisionFor(elementId) + this.factIndex.relationSourceRevision(elementId);
  }

  load(elementId: string, direction: SliceDirection, cancellation?: AnalysisCancellationToken, returnTo?: string): RelationFrontier {
    cancellation?.throwIfCancelled();
    const before = this.demand?.getDemandStats?.() ?? null;
    const beforeCounts = before && {
      sourceFilesVisited: before.sourceFilesVisited,
      astUnitsVisited: before.astUnitsVisited,
      partitionsVisited: before.partitionsVisited,
    };
    this.demand?.prepare(elementId, direction, returnTo, cancellation);
    const after = this.demand?.getDemandStats?.() ?? null;
    const recipes = new RelationRecipeStore();
    let recipesExamined = 0;
    for (const primaryFile of this.factIndex.relationSourceFilesFor(elementId)) {
      cancellation?.throwIfCancelled();
      const descriptors = this.index.query({
        elementId,
        direction,
        producerFile: primaryFile,
      });
      recipesExamined += descriptors.length;
      for (const descriptor of descriptors) {
        recipes.add(recipeFromDescriptor(descriptor));
      }
    }
    return {
      recipes: recipes.values,
      revision: this.currentRevision(elementId),
      relationIndexCount: recipes.size * 2,
      sourceFilesVisited: statDelta(beforeCounts?.sourceFilesVisited, after?.sourceFilesVisited),
      astUnitsVisited: statDelta(beforeCounts?.astUnitsVisited, after?.astUnitsVisited),
      partitionsVisited: statDelta(beforeCounts?.partitionsVisited, after?.partitionsVisited),
      recipesExamined,
      collectorStats: emptyProgramEvidenceCollectionStats(0),
    };
  }

  gaps(elementId: string): readonly ProgramEvidenceGap[] { return this.demand?.gaps(elementId) ?? []; }
  getDemandStats(): ProgramEvidenceDemandStats | null { return this.demand?.getDemandStats?.() ?? null; }
}

function statDelta(before: number | undefined, after: number | undefined): number {
  return before === undefined || after === undefined ? 0 : Math.max(0, after - before);
}

/** Capture compact descriptors during the same pass that collects facts. */
export function relationIndexSink(index: CompactRelationIndex): RelationSink {
  const seenByProducer = new Map<string, Set<string>>();
  const sequenceByProducer = new Map<string, number>();
  return (input) => {
    const producerFile = input.evidence[0]?.file ?? null;
    const producerKey = producerFile ?? "\u0000";
    const seen = seenByProducer.get(producerKey) ?? new Set<string>();
    if (seen.has(input.id)) return;
    const sourceSequence = sequenceByProducer.get(producerKey) ?? 0;
    const descriptor = createCompactRelationDescriptor({
      from: input.from,
      to: input.to,
      kind: input.kind,
      evidence: input.evidence.map(compactLocation),
      proof: {
        kind: input.proof.kind,
        detail: input.proof.detail,
        locations: input.proof.locations.map(compactLocation),
      },
      confidence: input.confidence,
      sourceSequence,
      contributingFiles: contributingFiles(input),
      producerFile,
    });
    if (descriptor.descriptorId !== input.id) {
      throw new Error(`Compact relation identity mismatch for ${input.id}.`);
    }
    seen.add(input.id);
    seenByProducer.set(producerKey, seen);
    sequenceByProducer.set(producerKey, sourceSequence + 1);
    index.add(descriptor);
  };
}

function compactLocation(location: ProgramEvidenceLocation): CompactRelationLocationToken {
  return {
    file: location.file,
    start: {
      line: location.span.startLine,
      column: location.span.startColumn,
    },
    end: {
      line: location.span.endLine,
      column: location.span.endColumn,
    },
  };
}

function expandLocation(location: CompactRelationLocationToken): ProgramEvidenceLocation {
  return {
    file: location.file,
    line: location.start.line,
    column: location.start.column,
    span: {
      startLine: location.start.line,
      startColumn: location.start.column,
      endLine: location.end.line,
      endColumn: location.end.column,
    },
  };
}

function contributingFiles(input: RelationRecipeInput): string[] {
  return [...new Set([
    ...input.evidence.map((location) => location.file),
    ...input.proof.locations.map((location) => location.file),
  ])];
}

function recipeFromDescriptor(descriptor: CompactRelationDescriptor): RelationRecipeInput {
  return {
    id: descriptor.descriptorId,
    from: descriptor.from,
    to: descriptor.to,
    kind: descriptor.kind,
    evidence: descriptor.evidence.map(expandLocation),
    proof: {
      kind: descriptor.proof.kind,
      detail: descriptor.proof.detail,
      locations: descriptor.proof.locations.map(expandLocation),
    },
    confidence: descriptor.confidence,
  };
}
