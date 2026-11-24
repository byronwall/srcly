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
  /** Each way the path took back from the read, in order: the first state step says whose state it is. */
  via: ProducerVia[];
  /** `proven` when every step from the field to the read is proven or modelled; a state's seed counts as proven for its first value. */
  status: "proven" | "partial";
};

export type FieldProducers = {
  producers: FieldProducer[];
  /**
   * A path to the read's first value that may still fill the field ends
   * with no producer: a call nothing returns into, a spread or computed key,
   * an operand, a function more than one call reaches, a parameter no call
   * binds. One producer found beside an open path is not the answer. A
   * later write's path never opens it.
   */
  open: boolean;
  /** Where those open paths end, and why, for the card to open. */
  stops: ProducerStop[];
};

/**
 * Why a path that may fill the field ends: a call nothing returns into
 * (`no-return`), another end (`dead-end`), a step that widens to the whole
 * value (`widened`), a spread or computed key (`unnamed-member`), an operand
 * (`operand`), a function more than one call reaches (`callers`), a
 * destructured or defaulted binding (`binding`), a function read without its
 * call (`accessor`), a state factory with no initial value of its own
 * (`factory`), a write into the read (`write`), an object with no such field
 * (`missing`: the read can be undefined), an object the code changes after it
 * is built (`mutable`), a function that can end without this return
 * (`fallthrough`: a branch with no return, a generator).
 */
export type ProducerStopReason = "no-return" | "fallthrough" | "dead-end" | "missing" | "mutable" | "widened" | "unnamed-member" | "operand" | "callers" | "binding" | "accessor" | "factory" | "write" | "budget";
export type ProducerStop = { elementId: string; reason: ProducerStopReason };

/** What the walk asks of the language host. */
export type ProducerHooks = {
  /** An object literal's members in source order (`LanguageHost.objectMembers`); null when unknown. */
  members(pack: ProgramElement): (string | null)[] | null;
  /** Whether the function a parameter belongs to has exactly one call site, so its argument is the only value it holds. */
  oneCaller(parameter: ProgramElement): boolean;
  /** A destructured or defaulted binding (`LanguageHost.unsureBinding`). */
  unsureBinding(element: ProgramElement): boolean;
  /** A state factory's call (`LanguageHost.stateFactory`). */
  stateFactory(element: ProgramElement): boolean;
  /** A function value (`LanguageHost.callable`): a signal's getter, whose own fields are not its state's. */
  callable(element: ProgramElement): boolean;
  /** An object literal the code changes after building it (`LanguageHost.mutable`): its members are not the field's only value. */
  mutable(pack: ProgramElement): boolean;
  /** A binding whose object the code changes (`LanguageHost.mutatedBinding`). */
  mutatedBinding(binding: ProgramElement): boolean;
  /** A return that may not be all the call yields (`LanguageHost.returnUnsure`); `async` when it is only once awaited. */
  returnUnsure(ret: ProgramElement): boolean | "async";
  /** A call awaited where it is made (`LanguageHost.awaited`). */
  awaited(call: ProgramElement): boolean;
};

const MAX_WORK = 4000;
/** Elements whose inputs are operands or a condition, not the value itself: a field of the result is no field of an input. */
const OPERATIONS = new Set(["derived", "selection"]);

const within = (inner: ProgramElement, outer: ProgramElement) => {
  const a = inner.location.span;
  const b = outer.location.span;
  const before = (l1: number, c1: number, l2: number, c2: number) => l1 < l2 || (l1 === l2 && c1 <= c2);
  return inner.location.file === outer.location.file && inner.id !== outer.id && before(b.startLine, b.startColumn, a.startLine, a.startColumn) && before(a.endLine, a.endColumn, b.endLine, b.endColumn);
};

/** The first state step on a path: whose state the value went through first, back from the read. */
export const firstStateStep = (via: readonly ProducerVia[]) => via.find((step) => step !== "return") ?? null;

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
 * position) ends that path and leaves the answer open: a whole object
 * carried somewhere is never proof of one of its fields.
 */
export function fieldProducers(slice: EvidenceSlice, seedId: string, hooks: ProducerHooks): FieldProducers {
  const byId = new Map(slice.elements.map((element) => [element.id, element]));
  const into = new Map<string, ProgramRelation[]>();
  for (const relation of slice.relations) {
    const traits = relationTraits(relation.kind);
    if (traits.structural || traits.callee) continue;
    (into.get(relation.to) ?? into.set(relation.to, []).get(relation.to)!).push(relation);
  }
  const incoming = (id: string) => into.get(id) ?? [];
  const cache: PackFieldCache = new Map();
  const memberCache = new Map<string, (string | null)[] | null>();
  const members = (pack: ProgramElement) => (memberCache.has(pack.id) ? memberCache.get(pack.id)! : memberCache.set(pack.id, hooks.members(pack)).get(pack.id)!);
  /** A state's own element: something seeds it. A step into it is a write; a step out of it (a getter, the store) is a read. */
  const isState = (id: string) => incoming(id).some((relation) => relation.proof.kind === "state-initialization");
  /**
   * Whether `field` in this pack is that member's value: named once, after
   * every member whose name is not known (a later spread or computed key may
   * replace it). Without the source's members, any unnamed member drawn into
   * the pack leaves it unknown.
   */
  const settled = (pack: ProgramElement, field: string) => {
    const known = members(pack);
    if (known) return known.filter((name) => name === field).length === 1 && known.lastIndexOf(field) > known.lastIndexOf(null);
    return !incoming(pack.id).some((relation) => relation.kind === "pack-field" && packedField(pack, relation, cache) === SPREAD);
  };
  /** A later named member replaces whatever an unnamed one before it held. */
  const shadowed = (pack: ProgramElement, field: string) => {
    const known = members(pack);
    return !!known && known.lastIndexOf(field) > known.lastIndexOf(null);
  };
  /** A pack whose every member is named and none is the field: the field is not there. */
  const lacks = (element: ProgramElement, field: string) => {
    const known = element.kind === "object-pack" ? members(element) : null;
    return !!known && !known.includes(null) && !known.includes(field);
  };

  type Item = { id: string; path: FieldPath; via: ProducerVia[]; partial: boolean };
  /** Why one step back from `current` to `target` cannot carry the field exactly, and where to say so; null when it can. */
  const blocked = (relation: ProgramRelation, item: Item, current: ProgramElement, target: ProgramElement, path: FieldPath): ProducerStop | null => {
    const at = (elementId: string, reason: ProducerStopReason) => ({ elementId, reason });
    // A field read pushes exactly its field; a path too deep to hold it no longer names the field.
    if (relation.kind === "field-input" && (path.length !== item.path.length + 1 || path.slice(0, -1).join(".") !== item.path.join("."))) return at(current.id, "widened");
    if (item.path.length === 0) return null;
    // Into a caller's argument: only the function's one call site says which value the parameter holds.
    if (relation.kind === "argument-binding" && !hooks.oneCaller(current)) return at(current.id, "callers");
    // A destructured or defaulted binding, or a shifted argument, may hold another field or the default.
    if (hooks.unsureBinding(target) || (relation.kind === "argument-binding" && hooks.unsureBinding(current))) return at(target.id, "binding");
    // A binding whose object the code changes holds more than what was bound to it.
    if ((target.kind === "alias" || target.kind === "parameter") && hooks.mutatedBinding(target)) return at(target.id, "mutable");
    // Into a function's return (a call's, or a lazy initial value's): only if that return is all the function can yield.
    if (target.kind === "return") {
      const unsure = hooks.returnUnsure(target);
      if (unsure === true || (unsure === "async" && !(relation.kind === "return-value" && hooks.awaited(current)))) return at(target.id, "fallthrough");
    }
    if (isState(target.id) && throughState(relation.proof.kind)) {
      // A getter read without its call (`get.length`) reads the function; a store hook called with a selector reads what the selector picks.
      if (current.kind === "call" && incoming(current.id).some((other) => other.kind === "argument")) return at(current.id, "accessor");
    }
    if (current.kind !== "call" && isState(target.id) && hooks.callable(target)) return at(current.id, "accessor");
    return null;
  };
  const queue: Item[] = [{ id: seedId, path: [], via: [], partial: false }];
  const seen = new Set<string>([`${seedId}||`]);
  const found = new Map<string, FieldProducer>();
  const stops = new Map<string, ProducerStop>();
  let open = false;
  /** A path that may fill the field ends here; only a path to the read's first value leaves the answer open. */
  const stop = (item: Pick<Item, "via">, at: string, reason: ProducerStopReason) => {
    if (firstStateStep(item.via) === "write") return;
    open = true;
    if (!stops.has(`${at}|${reason}`)) stops.set(`${at}|${reason}`, { elementId: at, reason });
  };
  for (let work = 0; queue.length; work += 1) {
    if (work >= MAX_WORK) {
      stop({ via: [] }, seedId, "budget");
      break;
    }
    const item = queue.shift()!;
    const current = byId.get(item.id);
    if (!current) continue;
    const named = item.path.length > 0;
    if (named && OPERATIONS.has(current.kind)) {
      stop(item, current.id, "operand");
      continue;
    }
    let continued = false;
    // A call that no return or modelled result enters (only its arguments and its callee): its value comes from outside.
    if (named && current.kind === "call" && incoming(item.id).every((relation) => relation.kind === "argument" || relation.kind === "carrier" || (relation.kind === "references" && byId.has(relation.from) && within(byId.get(relation.from)!, current)))) {
      stop(item, current.id, "no-return");
      continue;
    }
    // The read's own field read is where its field comes from; another step into the read (a write to it) may supply it too.
    const atSeed = item.id === seedId && incoming(item.id).some((relation) => relation.kind === "field-input");
    for (const relation of incoming(item.id)) {
      const target = byId.get(relation.from);
      if (!target) continue;
      if (atSeed && relation.kind !== "field-input") {
        stop(item, current.id, "write");
        continue;
      }
      // Before any field is named, only a step that keeps the value, or a field read, goes on; anything else (a member's write into the read) may supply it.
      if (!named && relation.kind !== "field-input" && !keepsIdentity(relation.kind)) {
        stop(item, current.id, "write");
        continue;
      }
      const path = stepFieldPath(item.path, relation, current, target, false, cache);
      if (path === null) continue;
      continued = true;
      const init = relation.proof.kind === "state-initialization";
      // The factory's call seeds the state too, as bookkeeping around its own initial value: that value is the first value.
      // With no initial value of its own (a reducer's), what the call's other arguments do is not the first value.
      if (init && hooks.stateFactory(target)) {
        if (!incoming(item.id).some((other) => other !== relation && other.proof.kind === "state-initialization" && byId.has(other.from) && within(byId.get(other.from)!, target))) stop(item, target.id, "factory");
        continue;
      }
      const step: ProducerVia | null = init ? "initialization" : throughState(relation.proof.kind) && relation.status !== "proven" && isState(item.id) ? "write" : relation.kind === "return-value" || relation.kind === "return-expression" ? "return" : null;
      const via = step && item.via.at(-1) !== step ? [...item.via, step] : item.via;
      const block = blocked(relation, item, current, target, path);
      if (block) {
        stop({ via }, block.elementId, block.reason);
        continue;
      }
      // A read out of a state (a getter's call, the store itself) is as sure as the first value it reads: only its time is not proven.
      const stateRead = throughState(relation.proof.kind) && isState(target.id);
      const assumed = proofStrength(relation.proof.kind) === "assumed";
      const partial = item.partial || assumed || (!init && !stateRead && relation.status !== "proven");
      if (relation.kind === "pack-field" && named) {
        const field = packedField(current, relation, cache);
        // Only a member named as the field the walk is after fills it; a spread or computed key may hold it, unless a later named member replaces it.
        if (field === SPREAD || field === null) {
          if (!shadowed(current, item.path[item.path.length - 1])) stop({ via }, current.id, field === null ? "widened" : "unnamed-member");
          continue;
        }
        // At every level, the member must be the field's own settled value.
        if (field === item.path[item.path.length - 1] && !settled(current, field)) {
          stop({ via }, current.id, "unnamed-member");
          continue;
        }
        if (item.path.length === 1 && path.length === 0 && field === item.path[0]) {
          if (hooks.mutable(current)) {
            stop({ via }, current.id, "mutable");
            continue;
          }
          const key = `${target.id}|${current.id}|${via.join(",")}`;
          if (!found.has(key)) found.set(key, { elementId: target.id, packId: current.id, field, via, status: partial ? "partial" : "proven" });
          continue;
        }
      }
      // A step that is not the field's own widened the path to the whole value: it no longer names the field.
      if (path.length === 0 && named) {
        // A call's argument is no return: a call nothing returns into is where the value comes from outside.
        const noReturn = current.kind === "call" && relation.kind === "argument" && !incoming(item.id).some((other) => other.kind === "return-value" || keepsIdentity(other.kind));
        stop({ via }, current.id, noReturn ? "no-return" : "widened");
        continue;
      }
      const key = `${target.id}|${path.join(".")}|${via.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ id: target.id, path, via, partial });
    }
    // A path that still names the field and ends here (a call nothing returns into, a parameter no call binds) may fill it from outside;
    // an object with no such field leaves the read undefined on this path.
    if (named && !continued) stop(item, current.id, lacks(current, item.path[item.path.length - 1]) ? "missing" : current.kind === "call" ? "no-return" : "dead-end");
  }
  return { producers: [...found.values()], open, stops: [...stops.values()] };
}
