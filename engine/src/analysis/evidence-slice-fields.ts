import type { ProgramElement, ProgramRelation } from "./scope-seam";

/**
 * The field path a slice follows (access paths, k-limited): which field of
 * the current value the walk is after, innermost last. Backward, a field read
 * pushes its field as the walk steps to its receiver, and an object pack is
 * entered only through that field (or a spread, which may hold it); forward,
 * a value packed as a field pushes it, and only a read of that field takes it
 * back out. An empty path is the whole value, which reaches every field, as a
 * slice without paths did. Only steps that keep a value's identity (a
 * reference, a binding, a return) keep the path; any other step (a library
 * call, an operator, an unknown field) widens it to the whole value, so a
 * path never cuts a flow it cannot name.
 */
export type FieldPath = readonly string[];

const MAX_FIELD_PATH = 4;
const KEEPS_IDENTITY = new Set(["references", "argument-binding", "return-expression", "return-value"]);
const SPREAD = Symbol("spread");

export type PackFieldCache = Map<string, Record<string, string> | null>;

/** The field an object pack holds at a property's position (its `fields` attribute), a spread or computed key, or null when the pack names none. */
function packedField(pack: ProgramElement, relation: ProgramRelation, cache: PackFieldCache): string | typeof SPREAD | null {
  if (!cache.has(pack.id)) {
    const raw = pack.attributes?.fields;
    cache.set(pack.id, typeof raw === "string" ? (JSON.parse(raw) as Record<string, string>) : null);
  }
  const fields = cache.get(pack.id);
  if (!fields) return null;
  const span = relation.proof.locations[0]?.span;
  return (span && fields[`${span.startLine}:${span.startColumn}`]) || SPREAD;
}

/**
 * The field path after following `relation` from `current` to `target`, or
 * null when the relation moves another field than the one the walk is after.
 */
export function stepFieldPath(
  path: FieldPath,
  relation: ProgramRelation,
  current: ProgramElement,
  target: ProgramElement,
  forward: boolean,
  cache: PackFieldCache,
): FieldPath | null {
  const push = (field: string): FieldPath => [...path.slice(-(MAX_FIELD_PATH - 1)), field];
  const pop = (field: string): FieldPath | null => (path.length === 0 ? path : path[path.length - 1] === field ? path.slice(0, -1) : null);
  if (relation.kind === "field-input") {
    const read = forward ? target : current;
    if (!read.fieldName) return [];
    return forward ? pop(read.fieldName) : push(read.fieldName);
  }
  if (relation.kind === "pack-field") {
    const field = packedField(forward ? target : current, relation, cache);
    if (field === null) return [];
    if (field === SPREAD) return path;
    return forward ? push(field) : pop(field);
  }
  return KEEPS_IDENTITY.has(relation.kind) ? path : [];
}
