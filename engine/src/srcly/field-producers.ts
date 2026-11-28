import type { EvidenceSlice } from "../analysis/evidence-slice";
import { keepsIdentity, packedField, SPREAD, stepFieldPath, type FieldPath, type PackFieldCache } from "../analysis/evidence-slice-fields";
import type { ProgramElement, ProgramRelation } from "../analysis/scope-seam";
import type { StateEffect } from "./host";
import type { Span } from "./selection";
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
  /**
   * Why this value may not be what the read sees, where the path to it
   * passed a soft stop (`SOFT_STOPS`): another caller, a changed object, a
   * default, an unnamed member. The walk went on past each one.
   */
  caveats: ProducerStop[];
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
 * (`fallthrough`: a branch with no return, a generator), a return handed
 * to a library call (`callback`: `.then(f)`, a store creator), a method that
 * another receiver's method of the same name may replace (`receiver`).
 */
export type ProducerStopReason = "receiver" | "no-return" | "fallthrough" | "callback" | "dead-end" | "missing" | "mutable" | "widened" | "unnamed-member" | "operand" | "callers" | "binding" | "accessor" | "factory" | "write" | "budget";
export type ProducerStop = { elementId: string; reason: ProducerStopReason };

/**
 * Stops the walk goes on past, as caveats on what it finds beyond them: the
 * value there can still fill the field, but it may not be the only one.
 * Every other reason ends the path (nothing past it names the field).
 */
const SOFT_STOPS = new Set<ProducerStopReason>(["receiver", "callers", "binding", "mutable", "fallthrough", "callback", "unnamed-member", "write"]);

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
  /** A value that may be a function (`LanguageHost.mayCall`): a setter handed it may call it. */
  mayCall(value: ProgramElement): boolean;
  /** The right side of a compound assignment (`LanguageHost.combinedWrite`): `n += 1` stores n + 1, not 1. */
  combinedWrite(value: ProgramElement): boolean;
  /** A binding whose object the code changes (`LanguageHost.mutatedBinding`). */
  mutatedBinding(binding: ProgramElement): boolean;
  /** The write-effect model of the state at this element (`LanguageHost.stateEffects`); null when the host has none. */
  stateEffects(state: ProgramElement): StateEffect[] | null;
  /** The expressions a function written in place returns at every exit (`LanguageHost.ownReturns`); null when it may end another way. */
  ownReturns(fn: ProgramElement): Span[] | null;
  /** A value that may be a plain object (`LanguageHost.mayObject`): one a store setter could merge. */
  mayObject(value: ProgramElement): boolean;
  /** A return that may not be all the call yields (`LanguageHost.returnUnsure`); `async` when it is only once awaited. */
  returnUnsure(ret: ProgramElement): boolean | "async" | "callback" | "method";
  /** A call that passes arguments (`LanguageHost.hasArguments`). */
  hasArguments(call: ProgramElement): boolean;
  /** A call in an optional chain (`LanguageHost.optionalCall`): when it short-circuits, the value is undefined. */
  optionalCall(call: ProgramElement): boolean;
  /** A call whose function can be replaced (`LanguageHost.calleeReplaced`). */
  calleeReplaced(call: ProgramElement): boolean;
  /** A call awaited where it is made (`LanguageHost.awaited`). */
  awaited(call: ProgramElement): boolean;
};

const MAX_WORK = 4000;
/** Elements whose inputs are operands or a condition, not the value itself: a field of the result is no field of an input. */
const OPERATIONS = new Set(["derived", "selection"]);

const sameSpan = (a: Span, b: Span) => a.startLine === b.startLine && a.startColumn === b.startColumn && a.endLine === b.endLine && a.endColumn === b.endColumn;
const inSpan = (inner: Span, outer: Span) => {
  const before = (l1: number, c1: number, l2: number, c2: number) => l1 < l2 || (l1 === l2 && c1 <= c2);
  return before(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) && before(inner.endLine, inner.endColumn, outer.endLine, outer.endColumn);
};
/** Whether a read of this path from a state's root (outermost field first) and a write under this prefix name different fields at some level. */
const disjoint = (read: readonly string[], prefix: readonly string[]) => read.some((field, index) => index < prefix.length && prefix[index] !== field);

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

  /**
   * The write-effect model, by the state each write reaches: every state the
   * walk passes and the field paths it reads there. A write the slice does
   * not hold (`resolved` false) may change any of those reads its prefix
   * does not rule out.
   */
  const effectCache = new Map<string, StateEffect[] | null>();
  const effectsOf = (state: ProgramElement) => (effectCache.has(state.id) ? effectCache.get(state.id)! : effectCache.set(state.id, hooks.stateEffects(state)).get(state.id)!);
  const statePaths = new Map<string, FieldPath[]>();
  /** The model's effect whose value is this element (`exact`), or holds it, among the states the walk passed. */
  const effectAt = (value: ProgramElement, exact: boolean) => {
    for (const id of statePaths.keys()) {
      const state = byId.get(id)!;
      if (state.location.file !== value.location.file) continue;
      // The value itself, under or with its parentheses and assertions: not an object inside it (`set({ user: { … } })` replaces `user`).
      const hit = effectsOf(state)?.find((effect) => effect.value && effect.argument && (exact ? sameSpan(effect.value, value.location.span) : inSpan(effect.value, value.location.span) && inSpan(value.location.span, effect.argument)));
      if (hit) return hit;
    }
    return null;
  };
  /** A merge at the root (Solid's `setStore({ other })`) keeps the fields its object does not name: the stored value is the old object, changed. */
  const mergedInto = (value: ProgramElement) => effectAt(value, true)?.effect === "merge";
  /** A value a merging setter is handed that may be an object: it may be merged into the old one, so it is not surely the value stored. */
  const mayMerge = (value: ProgramElement) => !!effectAt(value, false)?.merges && hooks.mayObject(value);
  type Item = { id: string; path: FieldPath; via: ProducerVia[]; partial: boolean; caveats: ProducerStop[] };
  /** Why one step back from `current` to `target` cannot carry the field exactly, and where to say so; null when it can. */
  const blocked = (relation: ProgramRelation, item: Item, current: ProgramElement, target: ProgramElement, path: FieldPath, via: ProducerVia[]): ProducerStop | null => {
    const at = (elementId: string, reason: ProducerStopReason) => ({ elementId, reason });
    // A field read pushes exactly its field; a path too deep to hold it no longer names the field.
    if (relation.kind === "field-input" && (path.length !== item.path.length + 1 || path.slice(0, -1).join(".") !== item.path.join("."))) return at(current.id, "widened");
    if (item.path.length === 0) return null;
    // A compound write (`n.count += 1`) stores the old value combined with this one: an operand of the stored value.
    if (relation.kind === "pack-field" && hooks.combinedWrite(target)) return at(target.id, "operand");
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
      if (unsure === "method") return at(target.id, "receiver");
      if (relation.kind === "return-value" && hooks.calleeReplaced(current)) return at(current.id, "receiver");
      // A return reaches the read only out of its own call, or as a state's lazy initial value (an updater's return is a later write, listed apart).
      // Any other way (a library call it was handed to: `.then(f)`) gives the caller what that call makes of it.
      if (relation.kind === "return-value" && hooks.optionalCall(current)) return at(current.id, "fallthrough");
      const ownCall = relation.kind === "return-value" && unsure !== "callback";
      if (!ownCall && relation.proof.kind !== "state-initialization" && firstStateStep(via) !== "write") return at(target.id, "callback");
    }
    if (isState(target.id) && throughState(relation.proof.kind)) {
      // A getter read without its call (`get.length`) reads the function; a store hook called with a selector reads what the selector picks.
      if (current.kind === "call" && hooks.hasArguments(current)) return at(current.id, "accessor");
    }
    if (current.kind !== "call" && isState(target.id) && hooks.callable(target)) return at(current.id, "accessor");
    return null;
  };
  /**
   * Where a later write's path ends without touching the field: a setter's
   * path (`setStore("other", 1)`) that names only other fields, or an inline
   * updater whose return the walk follows on its own path. An object that
   * lacks the field is not one (a replacement, `setState({ other })`, does
   * change it), nor is an updater whose return the slice does not hold.
   */
  const leavesField = (element: ProgramElement, field: string) => {
    if (hooks.callable(element)) {
      // Only a function written in place at the setter call, whose returns are inside it and cover every exit (no branch falls through,
      // not async); a return handed to the setter (`callback`) is what the setter stores.
      if (element.kind !== "literal") return false;
      const returns = slice.elements.filter((other) => other.kind === "return" && within(other, element));
      return returns.length > 0 && returns.every((ret) => { const unsure = hooks.returnUnsure(ret); return unsure === false || unsure === "callback"; }) && slice.relations.some((relation) => relation.kind === "return-expression" && returns.some((ret) => ret.id === relation.to));
    }
    // An object merged in that lacks the field leaves the old value; a replacement that lacks it changes it.
    if (members(element) !== null) return lacks(element, field) && mergedInto(element);
    const raw = element.attributes?.fields;
    const names = typeof raw === "string" ? Object.values(JSON.parse(raw) as Record<string, string>) : [];
    return names.length > 0 && !names.includes(field);
  };
  const queue: Item[] = [{ id: seedId, path: [], via: [], partial: false, caveats: [] }];
  /** Writes straight into the read: a caveat on every producer. */
  const seedCaveats: ProducerStop[] = [];
  const caveat = (list: ProducerStop[], elementId: string, reason: ProducerStopReason) =>
    list.some((item) => item.elementId === elementId && item.reason === reason) ? list : [...list, { elementId, reason }];
  const seedCaveat = (elementId: string, reason: ProducerStopReason) => seedCaveats.splice(0, seedCaveats.length, ...caveat(seedCaveats, elementId, reason));
  /**
   * A write step the model says the slice cannot place (a store path with a
   * computed key): no producer, its caveat stands for it, unless its literal
   * prefix names another field than the read (`set("items", pick, …)`
   * against a read of `left`).
   */
  const unplaced = (state: ProgramElement, value: ProgramElement, path: FieldPath) => {
    // The setter call that holds this value most closely is the one that wrote it (`set("dirty", true)` inside another call's updater).
    const holding = (effectsOf(state) ?? []).filter((item) => state.location.file === value.location.file && inSpan(value.location.span, item.span));
    const effect = holding.reduce<StateEffect | null>((best, item) => (!best || inSpan(item.span, best.span) ? item : best), null);
    // Only a path with a computed key: an updater made elsewhere keeps the edges the collector made for it, under its caveat.
    if (!effect || effect.resolved || effect.effect !== "path") return false;
    if (!disjoint([...path].reverse(), effect.prefix)) seedCaveat(state.id, "write");
    return true;
  };
  /** A function written in place at a setter call, with a return at every exit the slice holds: those returns are the values stored. */
  const updaterReturns = (fn: ProgramElement) => {
    const spans = hooks.callable(fn) ? hooks.ownReturns(fn) : null;
    const returned = spans?.map((span) => slice.elements.find((element) => element.location.file === fn.location.file && sameSpan(element.location.span, span)));
    // A merging setter may merge an object return into the old value (`set("user", () => ({ name }))`): only a primitive is stored as it is.
    if (returned?.some((element) => element && effectAt(fn, false)?.merges && hooks.mayObject(element))) return null;
    return returned && returned.every((element) => element) ? (returned as ProgramElement[]) : null;
  };
  /** Writes the slice does not hold, by the state they reach: each may change a read whose path its prefix does not rule out. */
  const unresolvedWrites = () => {
    for (const [id, paths] of statePaths) {
      const state = byId.get(id)!;
      for (const effect of effectsOf(state) ?? []) {
        if (!effect.resolved && paths.some((path) => !disjoint([...path].reverse(), effect.prefix))) seedCaveat(state.id, effect.effect === "alias" ? "mutable" : "write");
      }
    }
  };
  const seen = new Set<string>([`${seedId}||`]);
  const found = new Map<string, FieldProducer>();
  const stops = new Map<string, ProducerStop>();
  let open = false;
  /**
   * A path that may fill the field ends here. A path to the read's first
   * value leaves the answer open. A later write the walk cannot follow
   * (a computed key, an operand, a value that is an updater or a
   * replacement) may still change what the read sees: a `write` caveat on
   * every producer, which keeps the first value but never as a sure answer.
   */
  const stop = (item: Pick<Item, "via">, at: string, reason: ProducerStopReason) => {
    if (firstStateStep(item.via) === "write") {
      seedCaveats.splice(0, seedCaveats.length, ...caveat(seedCaveats, at, "write"));
      return;
    }
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
    if (isState(item.id)) (statePaths.get(item.id) ?? statePaths.set(item.id, []).get(item.id)!).push(item.path);
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
      // Before any field is named, only the read's own field read, or a step that keeps the value, goes on; anything else (a member's write into the read) may supply it.
      if ((atSeed && relation.kind !== "field-input") || (!named && relation.kind !== "field-input" && !keepsIdentity(relation.kind))) {
        seedCaveats.splice(0, seedCaveats.length, ...caveat(seedCaveats, current.id, "write"));
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
      // A write the model says the slice cannot place (a store path with a computed key) is no producer: its caveat stands for it.
      if (step === "write" && unplaced(current, target, item.path)) continue;
      const block = blocked(relation, item, current, target, path, via);
      let caveats = item.caveats;
      if (block && !SOFT_STOPS.has(block.reason)) {
        stop({ via }, block.elementId, block.reason);
        continue;
      }
      if (block) caveats = caveat(caveats, block.elementId, block.reason);
      // A read out of a state (a getter's call, the store itself) is as sure as the first value it reads: only its time is not proven.
      const stateRead = throughState(relation.proof.kind) && isState(target.id);
      const assumed = proofStrength(relation.proof.kind) === "assumed";
      const partial = item.partial || assumed || (!init && !stateRead && relation.status !== "proven");
      if (relation.kind === "pack-field" && named) {
        const field = packedField(current, relation, cache);
        // Only a member named as the field the walk is after fills it; a spread or computed key may hold it, unless a later named member replaces it.
        if (field === null) {
          stop({ via }, current.id, "widened");
          continue;
        }
        // A spread or computed key may hold the field, unless a later named member replaces it: walk into it, as a caveat.
        if (field === SPREAD) {
          if (shadowed(current, item.path[item.path.length - 1])) continue;
          caveats = caveat(caveats, current.id, "unnamed-member");
        }
        // At every level, a member named as the field is its value only when no later unnamed member may replace it.
        if (field === item.path[item.path.length - 1] && !settled(current, field)) caveats = caveat(caveats, current.id, "unnamed-member");
        if (item.path.length === 1 && path.length === 0 && field === item.path[0]) {
          if (hooks.mutable(current)) caveats = caveat(caveats, current.id, "mutable");
          // An object a store setter may merge in at this path (`set("doc", { other })`) is not surely the value stored: the old object may be, changed.
          if (via.includes("write") && mayMerge(target)) {
            seedCaveat(target.id, "write");
            continue;
          }
          // A state setter handed a function as the value itself (`setDoc("title", rename)`, not a member of an object it is handed)
          // stores what the function returns, never the function: its return is the value, wherever the state goes next.
          if (via.includes("write") && members(current) === null && hooks.mayCall(target)) {
            const returned = updaterReturns(target);
            if (returned) {
              for (const element of returned) {
                const key = `${element.id}|${current.id}|${via.join(",")}`;
                const known = found.get(key);
                if (known) known.caveats = caveats.reduce((list, item) => caveat(list, item.elementId, item.reason), known.caveats);
                else found.set(key, { elementId: element.id, packId: current.id, field, via, status: "partial", caveats });
              }
              continue;
            }
            // Otherwise what it returns may be any value: the whole answer is unsure, and a function is never the value stored.
            seedCaveat(target.id, "write");
            if (hooks.callable(target)) continue;
            caveats = caveat(caveats, target.id, "callback");
          }
          const key = `${target.id}|${current.id}|${via.join(",")}`;
          const known = found.get(key);
          if (known) known.caveats = caveats.reduce((list, item) => caveat(list, item.elementId, item.reason), known.caveats);
          else found.set(key, { elementId: target.id, packId: current.id, field, via, status: partial ? "partial" : "proven", caveats });
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
      const key = `${target.id}|${path.join(".")}|${via.join(",")}|${caveats.map((item) => `${item.elementId}:${item.reason}`).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ id: target.id, path, via, partial, caveats });
    }
    // A path that still names the field and ends here (a call nothing returns into, a parameter no call binds) may fill it from outside;
    // an object with no such field leaves the read undefined on this path.
    if (named && !continued && !(firstStateStep(item.via) === "write" && leavesField(current, item.path[item.path.length - 1]))) stop(item, current.id, lacks(current, item.path[item.path.length - 1]) ? "missing" : current.kind === "call" ? "no-return" : "dead-end");
  }
  unresolvedWrites();
  const producers = [...found.values()].map((producer) => ({ ...producer, caveats: seedCaveats.reduce((list, item) => caveat(list, item.elementId, item.reason), producer.caveats) }));
  return { producers, open, stops: [...stops.values()] };
}
