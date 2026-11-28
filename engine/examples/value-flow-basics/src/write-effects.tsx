import { useState } from "react";
import { createSignal } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";

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

// A patch typed as an intersection is still an object a path updater merges in.
export function IntersectionPatch() {
  const [s, set] = createStore({ user: { name: "Ada", active: false, role: "admin" } }); // @produces we-intersection initialization proven @caveat we-intersection write
  set("user", () => Object.assign({ name: "Grace" }, { active: true }));
  return <b>{s.user.role}{String(s.user === undefined)}</b>; // @trace we-intersection backward s.user
}

// A root merge is shallow: the object under a key replaces the old one.
export function ShallowMerge() {
  const [s, set] = createStore({ user: { name: "Ada", role: "admin" } as { name: string; role?: string } }); // @produces we-shallow initialization proven
  set({ user: { name: "Grace" } }); // @produces we-shallow write partial
  return <b>{String(s.user === undefined)}</b>; // @trace we-shallow backward s.user
}

// A draft write through the library's updater is the collector's to place.
export function DraftWrite() {
  const [s, set] = createStore({ k: "OLD" }); // @produces we-draft initialization proven @produces we-draft write partial
  set(produce((draft) => { draft.k = "NEW"; })); // @produces we-draft write partial
  return <b>{s.k}</b>; // @trace we-draft backward s.k
}

// An updater factory whose return type says nothing: what it returns may be an updater.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the shape under test is an erased return type
const makeUpdater = (k: string): any => (previous: { k: string }) => ({ ...previous, k });
export function ErasedUpdater() {
  const [doc, setDoc] = createSignal({ k: "OLD" }); // @produces we-erased initialization proven @caveat we-erased write
  setDoc(makeUpdater("NEW"));
  return <b>{doc().k}</b>; // @trace we-erased backward doc().k
}

// A getter in the initial value can make two paths one object: a prefix rules nothing out.
export function StoreGetter() {
  const key = "k" as "k" | "l";
  const [s, set] = createStore({ doc: { k: "OLD", l: "" }, get copy() { return this.doc; } }); // @produces we-getter initialization proven @caveat we-getter write
  set("copy", key, "NEW");
  return <b>{s.doc.k}</b>; // @trace we-getter backward s.doc.k
}

// The plain object behind a store, changed through `unwrap`, shows at the next read.
export function UnwrappedStore() {
  const [s] = createStore({ k: "OLD" }); // @produces we-unwrap initialization proven @caveat we-unwrap mutable
  const raw = unwrap(s);
  raw.k = "NEW";
  return <b>{s.k}</b>; // @trace we-unwrap backward s.k
}

// Under a path, Solid replaces an array: the array handed in is the value stored.
export function ArrayReplace() {
  const [s, set] = createStore({ todos: [{ title: "OLD" }] }); // @produces we-array initialization proven
  set("todos", []); // @produces we-array write partial
  return <b>{s.todos.length}</b>; // @trace we-array backward s.todos
}

// A plain name for the store, or a field of it, unwrapped and changed.
export function UnwrappedAlias() {
  const [s] = createStore({ k: "OLD", doc: { k: "D" } }); // @produces we-unwrap-alias initialization proven @caveat we-unwrap-alias mutable @produces we-unwrap-field initialization proven @caveat we-unwrap-field mutable
  const view = s;
  const raw = unwrap(view);
  raw.k = "NEW";
  const doc = unwrap(s.doc);
  doc.k = "NEW";
  return <b title={s.doc.k}>{s.k}</b>; // @trace we-unwrap-alias backward s.k @trace we-unwrap-field backward s.doc.k
}

// An old object with its own prototype is replaced, not merged: the omitted field is gone.
const base = { kind: "doc" };
export function CustomPrototypeMerge() {
  const [s, set] = createStore({ doc: Object.assign(Object.create(base) as { k?: string; other: number }, { k: "OLD", other: 0 }) }); // @produces-open we-prototype
  set("doc", { other: 1 });
  return <b>{String(s.doc.k)}</b>; // @trace we-prototype backward s.doc.k
}

// A path updater that returns an array: Solid stores it as it is.
export function ArrayUpdater() {
  const [s, set] = createStore({ todos: [{ title: "OLD" }] }); // @produces we-array-updater initialization proven
  set("todos", (todos) => [...todos, { title: "NEW" }]); // @produces we-array-updater write partial
  return <b>{s.todos.length}</b>; // @trace we-array-updater backward s.todos
}
