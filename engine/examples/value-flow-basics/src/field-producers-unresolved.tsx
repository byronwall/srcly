import { useState } from "react";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Writes the producer walk cannot pin to one field or one value. Each may
// still change the field the read sees, so none may leave the first value
// as a sure answer. The producer oracle runs each one.
declare const pick: boolean;

// A store write through a computed key: `key` is "title" when it runs.
export function ComputedKeyWrite() {
  const key = "title" as "title" | "body";
  const [store, setStore] = createStore({ title: "OLD", body: "B" }); // @produces fu-key initialization proven @caveat fu-key write
  setStore(key, "NEW");
  return <b>{store.title}</b>; // @trace fu-key backward store.title
}

// A whole-state write that picks an updater or a replacement.
export function SignalPick() {
  const [doc, setDoc] = createSignal({ title: "OLD" }); // @produces fu-signal initialization proven @caveat fu-signal write
  const next = { title: "NEW" };
  setDoc(pick ? () => next : next);
  return <b>{doc().title}</b>; // @trace fu-signal backward doc().title
}

export function StorePick() {
  const [store, setStore] = createStore({ title: "OLD" }); // @produces fu-store initialization proven @caveat fu-store write
  setStore(pick ? (state) => ({ ...state, title: "NEW" }) : { title: "NEW" });
  return <b>{store.title}</b>; // @trace fu-store backward store.title
}

export function ReactPick() {
  const [doc, setDoc] = useState({ title: "OLD" }); // @produces fu-react initialization proven @caveat fu-react write
  if (doc.title === "OLD") setDoc(pick ? () => ({ title: "NEW" }) : { title: "NEW" });
  return <b>{doc.title}</b>; // @trace fu-react backward doc.title
}

// An object assigned after its declaration, then written through an alias.
export function LaterAssignment() {
  let o: { k: string };
  // eslint-disable-next-line prefer-const -- the shape under test is a later assignment
  o = { k: "OLD" }; // @produces fu-later none proven @caveat fu-later mutable
  const alias = o;
  alias.k = "NEW";
  return <b>{o.k}</b>; // @trace fu-later backward o.k
}

// A method called through brackets writes its own object.
export function BracketMethod() {
  const o = { k: 10, increment() { this.k += 1; } }; // @produces fu-bracket none proven @caveat fu-bracket mutable
  const name = "increment" as const;
  o[name]();
  return <b>{o.k}</b>; // @trace fu-bracket backward o.k
}

// A replacement that leaves out the field, next to a read of the field it keeps.
export function ReplacementOmits() {
  const [doc, setDoc] = createSignal<{ k?: string; other?: string }>({ k: "OLD" }); // @produces fu-omits initialization proven @caveat fu-omits write
  const replacement = { other: "NEW" };
  setDoc(replacement);
  return <b title={doc().other}>{doc().k}</b>; // @trace fu-omits backward doc().k
}

// An updater reached through a member: the walk does not hold its return.
const actions = { rename: (previous: { k: string }) => ({ k: previous.k + "NEW" }) };
export function MemberUpdater() {
  const [doc, setDoc] = createSignal({ k: "OLD" }); // @produces fu-member initialization proven @caveat fu-member write
  setDoc(actions.rename);
  return <b>{doc().k}</b>; // @trace fu-member backward doc().k
}

// The assignment that installs the object also hands it on.
export function AssignedAndPassed() {
  let o: { k: string };
  Object.assign((o = { k: "OLD" }), { k: "NEW" }); // @produces fu-installed none proven @caveat fu-installed mutable
  return <b>{o.k}</b>; // @trace fu-installed backward o.k
}

// An inline updater that can fall through stores undefined on that branch.
export function FallthroughUpdater(props: { ok: boolean }) {
  const [doc, setDoc] = createSignal<{ k: string } | undefined>({ k: "OLD" }); // @produces fu-fallthrough initialization proven @caveat fu-fallthrough write
  setDoc((previous) => {
    if (props.ok) return { k: "NEW" }; // @produces fu-fallthrough write partial
  });
  return <b>{doc()?.k}</b>; // @trace fu-fallthrough backward doc()?.k
}
