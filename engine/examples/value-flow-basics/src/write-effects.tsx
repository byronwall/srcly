import { useState } from "react";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Writes that reach a state by another name: through a path updater, an
// alias of what a getter read, a setter carried in an object or bound, a
// path with a computed suffix, a setter called with nothing. Each may change
// the field the read sees, so none may leave the first value as a sure
// answer. The producer oracle runs each one.

// A store path updater stores what it returns, not itself: its return is the producer.
export function PathUpdater() {
  const [s, set] = createStore({ k: "OLD" }); // @produces we-path-updater initialization proven
  set("k", (v) => v + "NEW"); // @produces we-path-updater write partial @no-caveat we-path-updater
  return <b>{s.k}</b>; // @trace we-path-updater backward s.k
}

// A write through what a getter returned shows at a fresh read of the getter.
export function GetterAlias() {
  const [doc] = createSignal({ k: "OLD" }); // @produces we-alias initialization proven @caveat we-alias mutable
  const alias = doc();
  alias.k = "NEW";
  return <b>{doc().k}</b>; // @trace we-alias backward doc().k
}

// A setter carried in an object and called on the other side.
const invoke = (o: { set: (next: { k: string }) => void }) => {
  const { set } = o;
  set({ k: "NEW" });
};
export function SetterInObject() {
  const [doc, set] = createSignal({ k: "OLD" }); // @produces we-object initialization proven @caveat we-object write
  invoke({ set });
  return <b>{doc().k}</b>; // @trace we-object backward doc().k
}

// A bound setter.
export function BoundSetter() {
  const [doc, set] = createSignal({ k: "OLD" }); // @produces we-bound initialization proven @caveat we-bound write
  const bound = set.bind(null);
  bound({ k: "NEW" });
  return <b>{doc().k}</b>; // @trace we-bound backward doc().k
}

// A store path whose last key is computed: it may name the field or a parent.
export function ComputedSuffix() {
  const key = "k" as "k" | "other";
  const [s, set] = createStore({ doc: { k: "OLD" as unknown, other: "" as unknown } }); // @produces we-suffix initialization proven @caveat we-suffix write
  set("doc", key, { k: "NEW" });
  return <b>{String(s.doc.k)}</b>; // @trace we-suffix backward s.doc.k
}

// A Solid signal setter called with nothing stores undefined.
export function ZeroArgSetter() {
  const [doc, set] = createSignal<{ k: string } | undefined>({ k: "OLD" }); // @produces we-zero initialization proven @caveat we-zero write
  set();
  return <b>{doc()?.k}</b>; // @trace we-zero backward doc()?.k
}

// A store merge that names only other fields leaves this one as it was.
export function DisjointMerge() {
  const [s, set] = createStore({ k: "OLD", other: 0 }); // @produces we-merge initialization proven @no-caveat we-merge
  set({ other: 1 });
  return <b>{s.k}</b>; // @trace we-merge backward s.k
}

// A computed suffix under a literal prefix leaves a sibling of the prefix alone.
export function ComputedSuffixSibling() {
  const key = "k" as "k" | "other";
  const [s, set] = createStore({ doc: { k: "OLD" as unknown, other: "" as unknown }, meta: { k: "M" } }); // @produces we-suffix-sibling initialization proven @no-caveat we-suffix-sibling
  set("doc", key, { k: "NEW" });
  return <b>{s.meta.k}</b>; // @trace we-suffix-sibling backward s.meta.k
}

// Under a path, Solid merges only into an old plain object (a custom prototype is replaced): the field may change,
// and the object handed in is not what the path holds.
export function NestedMerge() {
  const [s, set] = createStore({ doc: { k: "OLD", other: 0 } }); // @produces we-nested-merge initialization proven @caveat we-nested-merge write @produces we-nested-whole initialization proven @caveat we-nested-whole write
  set("doc", { other: 1 });
  return <b title={String(s.doc.other)}>{s.doc.k}</b>; // @trace we-nested-merge backward s.doc.k @trace we-nested-whole backward s.doc
}

// A signal replacement is no merge: an object that lacks the field changes it.
export function SignalReplaceOmits() {
  const [doc, set] = createSignal<{ k?: string; other?: number }>({ k: "OLD" }); // @produces we-replace initialization proven @caveat we-replace write
  set({ other: 1 });
  return <b>{doc().k}</b>; // @trace we-replace backward doc().k
}

// A name that only reads what the getter returned changes nothing.
export function ReadOnlyAlias() {
  const [doc] = createSignal({ k: "OLD" }); // @produces we-read-alias initialization proven @no-caveat we-read-alias
  const view = doc();
  return <b title={view.k}>{doc().k}</b>; // @trace we-read-alias backward doc().k
}

// React's value is the state object itself: a write through it shows at the next read.
export function ReactValueWrite() {
  const [doc] = useState({ k: "OLD" }); // @produces we-react-value initialization proven @caveat we-react-value mutable
  doc.k = "NEW";
  return <b>{doc.k}</b>; // @trace we-react-value backward doc.k
}

// A path updater's object return may be merged into the old object: it is not the value stored.
export function PathUpdaterPatch() {
  const [s, set] = createStore({ user: { name: "Ada", role: "admin" } }); // @produces we-patch initialization proven @caveat we-patch write
  set("user", () => ({ name: "Grace" }));
  return <b>{s.user.role}{String(s.user === undefined)}</b>; // @trace we-patch backward s.user
}

// A setter call inside another call's updater is its own write, even when the outer one has a computed key.
export function NestedSetterCall() {
  const field = "name" as "name" | "email";
  const [s, set] = createStore({ dirty: false, form: { name: "A", email: "B" } }); // @produces we-nested-call initialization proven
  set("form", field, (previous) => {
    set("dirty", true); // @produces we-nested-call write partial
    return previous.toLowerCase();
  });
  return <b>{String(s.dirty)}</b>; // @trace we-nested-call backward s.dirty
}

// An updater made by another function: what it returns is stored.
const setField = (k: string) => (previous: { k: string }) => ({ ...previous, k });
export function MadeUpdater() {
  const [doc, setDoc] = createSignal({ k: "OLD" }); // @produces we-made initialization proven @caveat we-made write
  setDoc(setField("NEW"));
  return <b>{doc().k}</b>; // @trace we-made backward doc().k
}

// A key known only from its type is no literal: a narrowed `let` can hold another value when the setter runs.
let side: "left" | "right" = "left";
const flip = () => {
  side = "right";
};
export function NarrowedKey() {
  const key = "k" as "k" | "l";
  const [s, set] = createStore({ left: { k: "L", l: "" }, right: { k: "R", l: "" } }); // @produces we-narrowed initialization proven @caveat we-narrowed write
  flip();
  set(side, key, "NEW");
  return <b>{s.right.k}</b>; // @trace we-narrowed backward s.right.k
}
