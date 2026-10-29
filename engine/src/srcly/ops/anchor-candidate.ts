// Where an anchor starts: an exact span, a name on a line, or a drawn box's element id.
import path from "node:path";
import type { HostCandidate } from "../host";
import { EngineError } from "../protocol";
import { parseSpan, sameSpan } from "../selection";
import type { Tier1 } from "../session";

/** A host candidate (with the declaration spans to try when the engine has no evidence at the name itself); or an element named outright (T20). */
export type Resolved = HostCandidate & { seedId?: string };

/**
 * The expression to anchor at: an exact span (plus its text, as `valueFlow`
 * takes it), or a `name` on a `line` for a symbol picked from the import
 * graph or the treemap, where only the declaration's line is known.
 */
export function resolveCandidate(tier1: Tier1, file: string, params: Record<string, unknown>): Resolved {
  const { host } = tier1;
  // A drawn box added as an anchor (T20): the element itself, so the two traces share ids by construction.
  if (typeof params.elementId === "string" && params.elementId) {
    const element = tier1.provider().facts.getElement(params.elementId);
    if (!element) throw new EngineError("not-found", `No program element ${params.elementId}`);
    return { kind: element.kind, text: element.label, span: element.location.span, seedId: element.id };
  }
  if (typeof params.name === "string" && params.name) {
    if (!Number.isInteger(params.line) || (params.line as number) < 1) throw new EngineError("invalid-request", "params.name needs params.line");
    const found = host.identifierOnLine(file, params.name, params.line as number);
    if (!found) throw new EngineError("not-found", `No ${params.name} on line ${params.line} of ${path.basename(file)}`);
    return found;
  }
  const span = parseSpan(params.span);
  const text = typeof params.text === "string" ? params.text : null;
  const candidates = host.candidates(file, span, text);
  const candidate = candidates.find((item) => sameSpan(item.span, span)) ?? candidates[0];
  if (!candidate) throw new EngineError("unsupported-selection", "No supported expression at this selection; pick a candidate from selectExpression", { span });
  return candidate;
}
