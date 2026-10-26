// The one place the data-flow vocabulary (plan section 3.4) becomes text and
// color. Not analyzed is never 0: every surface names its outcome or reason.
import type { NaReason, Outcome } from "./api";

const REASONS: Record<NaReason, string> = {
  "node-not-found": "Node.js was not found",
  "engine-missing": "the data-flow engine is not installed",
  "no-tsconfig": "no tsconfig.json or Python project",
  "non-strict-tsconfig": "the tsconfig is not strict",
  "no-ts-files": "no TypeScript files",
  "typescript-not-found": "TypeScript was not found",
  "python-not-found": "no Python interpreter",
  "python-checker-not-found": "mypy is not installed",
  "no-python-files": "no Python files",
  "engine-crashed": "the engine stopped",
  "timed-out": "the engine timed out",
  "engine-protocol-mismatch": "the engine version does not match",
  "memory-limit": "the program needs more memory than the engine's limit",
};

/** Why the engine traced nothing from an anchor, by the reason it names (`unsupported`). */
const UNSUPPORTED: Record<string, string> = {
  "nothing-to-trace": "Nothing to trace: no parameter, return or call result carries a value in or out",
  "no-evidence-element": "The engine recorded nothing at this expression",
};

export function reasonText(reason: NaReason | null | undefined, message?: string | null): string {
  return reason ? REASONS[reason] ?? reason : message ?? "unknown reason";
}

/** The status-line text for an outcome; null when the result speaks for itself. */
export function labelFor(outcome: Outcome, reason?: NaReason | null, message?: string | null): string | null {
  switch (outcome) {
    case "ok":
      return null;
    case "assumed":
      return ASSUMED_LABEL;
    case "partial":
      return "Partial: some paths stop at frontiers";
    case "not-analyzed":
      return `Data flow N/A: ${reasonText(reason, message)}`;
    case "unsupported":
      return UNSUPPORTED[message ?? reason ?? ""] ?? message ?? "Unsupported by the analysis";
    case "stale":
      return "Source changed. Refresh.";
    case "cancelled":
      return null;
    case "budget":
      return message ? `Stopped at budget: ${message}` : "Stopped at budget";
  }
}

/** An `assumed` trace landed with no stop, but some step takes what code with no source does on trust. */
export const ASSUMED_LABEL = "Landed · assumes library code";

/**
 * Text color per outcome, from strongest to weakest: proven (`ok`), landed
 * by assumption (`assumed`), stopped somewhere (`partial`), and the rest.
 */
export function outcomeClass(outcome: Outcome): string {
  if (outcome === "ok") return "text-[var(--plc-success)]";
  if (outcome === "assumed") return "text-[var(--plc-assumed)]";
  if (outcome === "partial" || outcome === "budget" || outcome === "stale") return "text-[var(--plc-warning)]";
  if (outcome === "unsupported") return "text-[var(--plc-error)]";
  return "text-[var(--plc-on-muted)]";
}

/**
 * Proof kinds the engine takes on trust, with nothing to read (its `assumed`
 * proof strength, engine/src/srcly/kinds.ts): an edge carrying one is an
 * assumed step.
 */
const ASSUMED_PROOF_KINDS = new Set(["external-call", "partial-classification"]);

export function isAssumedProof(kind: string): boolean {
  return ASSUMED_PROOF_KINDS.has(kind);
}

export type EvidenceStatus = "proven" | "partial" | "unsupported";

/** Ink for an evidence status: proven is ordinary ink, the rest are quieter. */
export function toneFor(status: EvidenceStatus): string {
  if (status === "proven") return "var(--plc-on-surface)";
  if (status === "partial") return "var(--plc-on-muted)";
  return "var(--plc-on-disabled)";
}
