import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { useState } from "react";

// Where a field's producer is not one expression: a pack entered without
// the field's own name, a field path too deep to name, a call nothing
// returns into on one branch, a parameter several calls bind. Each names no
// producer, or leaves the answer open (`producersOpen`) beside the one it found.
type Note = { id: string; title: string; tags: string[] };
declare function externalNote(): Note;

export function ArrayLength() {
  const xs = ["ONE"];
  return <p>{xs.length}</p>; // @trace fpl-length backward xs.length @no-produces fpl-length
}

export function ComputedKey(props: { key: string }) {
  const obj = { [props.key]: { title: "INNER" } };
  return <p>{obj.title}</p>; // @trace fpl-computed backward obj.title @no-produces fpl-computed
}

export function TooDeep() {
  const deep = { a: { b: { c: { d: { title: "RIGHT" } } } } };
  return <p>{deep.a.b.c.d.title}</p>; // @trace fpl-deep backward deep.a.b.c.d.title @no-produces fpl-deep
}

export function SpreadAfter() {
  const note = { title: "STALE", ...externalNote() };
  return <p>{note.title}</p>; // @trace fpl-spread-after backward note.title @no-produces fpl-spread-after
}

export function SpreadBefore() {
  const note = { ...{ title: "OLD" }, title: "NEW" };
  return <p>{note.title}</p>; // @trace fpl-spread-before backward note.title @no-produces fpl-spread-before
}

function maybeNote(p: boolean): Note {
  if (p) return externalNote();
  return { id: "x", title: "ONLY_SOMETIMES", tags: [] }; // @produces fpl-branch return proven
}
export function OneBranchOpaque(props: { p: boolean }) {
  const note = maybeNote(props.p);
  return <p>{note.title}</p>; // @trace fpl-branch backward note.title @produces-open fpl-branch
}

function id<T>(value: T): T {
  return value;
}
function pick(p: boolean) {
  if (p) return id({ title: "A" });
  return { title: id({ title: "never" }).title.toUpperCase() }; // @produces fpl-two-calls return proven
}
export function TwoCalls(props: { p: boolean }) {
  const picked = pick(props.p);
  return <p>{picked.title}</p>; // @trace fpl-two-calls backward picked.title @produces-open fpl-two-calls
}

// A store seeded from another store's spread: the other store's writes are not this one's.
export function OtherStore() {
  const [one, setOne] = createStore({ title: "FIRST" });
  const [two] = createStore({ ...one });
  setOne("title", "FIRST_STORE_ONLY");
  return <p>{two.title}</p>; // @trace fpl-other-store backward two.title @no-produces fpl-other-store
}

// A lazy initial value and a signal's seed are first values; the getter that reads them is no write.
export function LazyInit() {
  const [state] = useState(() => ({ title: "FIRST" })); // @produces fpl-lazy initialization proven
  return <p>{state.title}</p>; // @trace fpl-lazy backward state.title
}
export function SignalSeed() {
  const [sig] = createSignal({ title: "SIGNAL_INIT" }); // @produces fpl-signal initialization proven
  return <p>{sig().title}</p>; // @trace fpl-signal backward sig().title
}

// The seed handed to the setter again: its first value and its later write both stay.
export function ReusedSeed() {
  const v = { title: "REUSED" }; // @produces fpl-reused initialization proven @produces fpl-reused write partial
  const [s, setS] = createStore(v);
  setS(v);
  return <p>{s.title}</p>; // @trace fpl-reused backward s.title
}
