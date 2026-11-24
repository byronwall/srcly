import type { EvidenceSlice } from "../analysis/evidence-slice";
import { keepsIdentity, packedField, SPREAD, stepFieldPath, type FieldPath, type PackFieldCache } from "../analysis/evidence-slice-fields";
import type { ProgramElement, ProgramRelation } from "../analysis/scope-seam";
import { proofStrength, relationTraits, throughState } from "./kinds";

/** How a producer's value reached the read: as a state's first value, a later write to that state, or out of a call's return. */
export type ProducerVia = "initialization" | "write" | "return";

export type FieldProducer = {
  /** The expression that fills the field. */
  elementId: string;
  /** The object it fills (`{ title: … }`). */
  packId: string;
  field: string;
  via: ProducerVia[];
  /** `proven` when every step from the field to the read is proven or modelled; a state's seed counts as proven for its first value. */
  status: "proven" | "partial";
};

export type FieldProducers = {
  producers: FieldProducer[];
  /**
   * A path that may still fill the field ends with no producer: a call
   * nothing returns into, a pack with a spread or computed key, a parameter
   * several calls bind, a field path too deep to name. One producer found
   * beside an open path is not the answer.
   */
  open: boolean;
};

const MAX_WORK = 4000;

/**
 * The expressions that fill the field an upstream walk reads: from the
 * seed, back over the slice's relations with the slice's own field path
 * (`stepFieldPath`), until an object pack is entered through exactly that
 * field and the path is empty again. That packed value is the field's
 * producer; the walk does not go on past it (the next witness, not the
 * field's history).
 *
 * Only a path the walk can name counts. A step that widens it to the whole
 * value (a library call, an operator, a pack with no field at that
 * position) ends that path: a whole object carried somewhere is never
 * proof of one of its fields.
 */
export function fieldProducers(slice: EvidenceSlice, seedId: string): FieldProducers {
  const byId = new Map(slice.elements.map((element) => [element.id, element]));
  const into = new Map<string, ProgramRelation[]>();
  for (const relation of slice.relations) {
    const traits = relationTraits(relation.kind);
    if (traits.structural || traits.callee) continue;
    (into.get(relation.to) ?? into.set(relation.to, []).get(relation.to)!).push(relation);
  }
  const incoming = (id: string) => into.get(id) ?? [];
  const cache: PackFieldCache = new Map();
  /** A state's own element: something seeds it. A step into it is a write; a step out of it (a getter, a selector) is a read. */
  const isState = (id: string) => incoming(id).some((relation) => relation.proof.kind === "state-initialization");
  /** A pack whose members are not all named: a spread or computed key may hold the field, before or after a named one. */
  const unnamedMember = (pack: ProgramElement) => incoming(pack.id).some((relation) => relation.kind === "pack-field" && packedField(pack, relation, cache) !== null && packedField(pack, relation, cache) === SPREAD);
  type Item = { id: string; path: FieldPath; via: ProducerVia[]; partial: boolean };
  const queue: Item[] = [{ id: seedId, path: [], via: [], partial: false }];
  const seen = new Set<string>([`${seedId}||`]);
  const found = new Map<string, FieldProducer>();
  let open = false;
  for (let work = 0; queue.length; work += 1) {
    if (work >= MAX_WORK) {
      open = true;
      break;
    }
    const item = queue.shift()!;
    const current = byId.get(item.id);
    if (!current) continue;
    const named = item.path.length > 0;
    let continued = false;
    // A parameter several calls bind: which call's value it holds is not known here.
    if (named && incoming(item.id).filter((relation) => relation.kind === "argument-binding").length > 1) {
      open = true;
      continue;
    }
    for (const relation of incoming(item.id)) {
      const target = byId.get(relation.from);
      if (!target) continue;
      // Before any field is named, only a step that keeps the value, or a field read, goes on.
      if (!named && relation.kind !== "field-input" && !keepsIdentity(relation.kind)) continue;
      const path = stepFieldPath(item.path, relation, current, target, false, cache);
      if (path === null) continue;
      continued = true;
      // A field read pushes exactly its field; a path too deep to hold it no longer names the field.
      if (relation.kind === "field-input" && (path.length !== item.path.length + 1 || path.slice(0, -1).join(".") !== item.path.join("."))) {
        open = true;
        continue;
      }
      const init = relation.proof.kind === "state-initialization";
      // The factory's call seeds the state too, as bookkeeping: where a seed or initializer of its own is there, that is the first value.
      if (init && target.kind === "call" && incoming(item.id).some((other) => other !== relation && other.proof.kind === "state-initialization")) {
        continue;
      }
      const step: ProducerVia | null = init ? "initialization" : throughState(relation.proof.kind) && relation.status !== "proven" && isState(item.id) ? "write" : relation.kind === "return-value" || relation.kind === "return-expression" ? "return" : null;
      const via = step && !item.via.includes(step) ? [...item.via, step] : item.via;
      const assumed = proofStrength(relation.proof.kind) === "assumed";
      // A read out of a state (a getter, the store itself) is as sure as the first value it reads: only its time is not proven.
      const stateRead = throughState(relation.proof.kind) && isState(target.id);
      const partial = item.partial || assumed || (!init && !stateRead && relation.status !== "proven");
      if (relation.kind === "pack-field" && named) {
        const field = packedField(current, relation, cache);
        // Only a member named as the field the walk is after fills it; a spread or computed key may hold it, so it is not proof.
        if (field === SPREAD || field === null) {
          if (path.length > 0) open = true;
          continue;
        }
        if (item.path.length === 1 && path.length === 0 && field === item.path[0]) {
          if (unnamedMember(current)) {
            open = true;
            continue;
          }
          const key = `${target.id}|${current.id}|${via.join(",")}`;
          if (!found.has(key)) found.set(key, { elementId: target.id, packId: current.id, field, via, status: partial ? "partial" : "proven" });
          continue;
        }
      }
      // A step that is not the field's own widened the path to the whole value: it no longer names the field.
      if (path.length === 0 && named) {
        open = true;
        continue;
      }
      const key = `${target.id}|${path.join(".")}|${via.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ id: target.id, path, via, partial });
    }
    // A path that still names the field and ends here (a call nothing returns into, a parameter no call binds) may fill it from outside.
    if (named && !continued) open = true;
  }
  return { producers: [...found.values()], open };
}
