import type { EvidenceSlice } from "../analysis/evidence-slice";
import { keepsIdentity, stepFieldPath, type FieldPath, type PackFieldCache } from "../analysis/evidence-slice-fields";
import type { ProgramRelation } from "../analysis/scope-seam";
import { relationTraits, throughState } from "./kinds";

/** How a producer's value reached the read: as a state's first value, a later write to that state, or out of a call's return. */
export type ProducerVia = "initialization" | "write" | "return";

export type FieldProducer = {
  /** The expression that fills the field. */
  elementId: string;
  /** The object it fills (`{ title: … }`). */
  packId: string;
  field: string;
  via: ProducerVia[];
  /** `proven` when every step from the field to the read is; a state's seed counts as proven for its first value. */
  status: "proven" | "partial";
};

const MAX_WORK = 4000;

/**
 * The expressions that fill the field an upstream walk reads: from the
 * seed, back over the slice's relations with the slice's own field path
 * (`stepFieldPath`), until an object pack is entered through that field and
 * the path is empty again. That packed value is the field's producer; the
 * walk does not go on past it (the next witness, not the field's history).
 *
 * Only a path the walk can name counts. A step that widens it to the whole
 * value (a library call, an operator) ends that path: a whole object
 * carried somewhere is never proof of one of its fields.
 */
export function fieldProducers(slice: EvidenceSlice, seedId: string): FieldProducer[] {
  const byId = new Map(slice.elements.map((element) => [element.id, element]));
  const into = new Map<string, ProgramRelation[]>();
  for (const relation of slice.relations) {
    const traits = relationTraits(relation.kind);
    if (traits.structural || traits.callee) continue;
    (into.get(relation.to) ?? into.set(relation.to, []).get(relation.to)!).push(relation);
  }
  type Item = { id: string; path: FieldPath; via: ProducerVia[]; partial: boolean };
  const queue: Item[] = [{ id: seedId, path: [], via: [], partial: false }];
  const seen = new Set<string>([`${seedId}|`]);
  const found = new Map<string, FieldProducer>();
  const cache: PackFieldCache = new Map();
  for (let work = 0; queue.length && work < MAX_WORK; work += 1) {
    const item = queue.shift()!;
    const current = byId.get(item.id);
    if (!current) continue;
    for (const relation of into.get(item.id) ?? []) {
      const target = byId.get(relation.from);
      if (!target) continue;
      // Before any field is named, only a step that keeps the value, or a field read, goes on.
      if (item.path.length === 0 && relation.kind !== "field-input" && !keepsIdentity(relation.kind)) continue;
      const path = stepFieldPath(item.path, relation, current, target, false, cache);
      if (path === null) continue;
      const init = relation.proof.kind === "state-initialization";
      const step: ProducerVia | null = init ? "initialization" : throughState(relation.proof.kind) && relation.status !== "proven" ? "write" : relation.kind === "return-value" || relation.kind === "return-expression" ? "return" : null;
      const via = step && !item.via.includes(step) ? [...item.via, step] : item.via;
      const partial = item.partial || (!init && relation.status !== "proven");
      if (relation.kind === "pack-field" && item.path.length === 1 && path.length === 0) {
        const key = `${target.id}|${current.id}`;
        if (!found.has(key)) found.set(key, { elementId: target.id, packId: current.id, field: item.path[0], via, status: partial ? "partial" : "proven" });
        continue;
      }
      // A step that is not the field's own widened the path to the whole value: it no longer names the field.
      if (path.length === 0 && item.path.length > 0) continue;
      const key = `${target.id}|${path.join(".")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ id: target.id, path, via, partial });
    }
  }
  return [...found.values()];
}
