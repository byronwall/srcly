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
