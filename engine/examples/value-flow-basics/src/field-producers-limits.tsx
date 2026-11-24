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

// A later named member replaces the spread before it: "NEW", never "OLD".
export function SpreadBefore() {
  const note = { ...{ title: "OLD" }, title: "NEW" }; // @produces fpl-spread-before none proven
  return <p>{note.title}</p>; // @trace fpl-spread-before backward note.title
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

// One helper, two calls on two branches: the walk cannot tell which call's argument the parameter holds.
function twice(p: boolean) {
  if (p) return id({ title: "A" });
  return id({ title: "B" });
}
export function TwoBranchesOneHelper(props: { p: boolean }) {
  const got = twice(props.p);
  return <p>{got.title}</p>; // @trace fpl-helper backward got.title @no-produces fpl-helper @produces-open fpl-helper
}

// An operand is no field of the result: a template's length, a ternary's condition.
export function Operands(props: { guard: { title: string } | null; a: Note; b: Note }) { // @stop fpl-ternary untraced parameter
  const text = `${{ length: 100 }}`;
  const chosen = props.guard ? props.a : props.b;
  return <p>{text.length} {chosen.title}</p>; // @trace fpl-template backward text.length @no-produces fpl-template @trace fpl-ternary backward chosen.title @no-produces fpl-ternary
}

// A later named member replaces a spread before it.
export function SpreadThenNamed(props: { defaults: Note }) {
  const note = { ...props.defaults, title: "FINAL" }; // @produces fpl-final none proven
  return <p>{note.title}</p>; // @trace fpl-final backward note.title
}

// One branch widens through an array: the other branch's field is not the answer.
function lengthy(p: boolean) {
  if (p) return ["x"];
  return { length: 99 }; // @produces fpl-widen return proven
}
export function Widened(props: { p: boolean }) {
  const result = lengthy(props.p);
  return <p>{result.length}</p>; // @trace fpl-widen backward result.length @produces-open fpl-widen
}

// A setter of another field keeps the first value proven.
export function OtherField() {
  const [store, setStore] = createStore({ title: "FIRST", other: 0 }); // @produces fpl-other-field initialization proven
  setStore("other", 1);
  return <p>{store.title}</p>; // @trace fpl-other-field backward store.title
}

// A store seeded from a call: that call's returned object is the first value.
function makeNote(): Note {
  return { id: "m", title: "MADE", tags: [] }; // @produces fpl-made initialization proven
}
export function SeededFromCall() {
  const [made] = createStore(makeNote());
  return <p>{made.title}</p>; // @trace fpl-made backward made.title
}

// A nested field written later: its first value is found, but it is not the answer (open).
export function NestedWrite() {
  const doc = { note: { title: "OLD" } }; // @produces fpl-nested-write none proven
  doc.note.title = "NEW";
  return <p>{doc.note.title}</p>; // @trace fpl-nested-write backward doc.note.title @produces-open fpl-nested-write
}

// A destructured parameter, or one with a default, holds a value the evidence does not name exactly.
function readPayload({ payload }: { payload: { title: string }; title: string }) {
  return payload.title; // @trace fpl-destructured backward payload.title @no-produces fpl-destructured @produces-open fpl-destructured
}
export function Destructured() {
  return <p>{readPayload({ payload: { title: "INNER" }, title: "OUTER" })}</p>;
}
function show(note: { title: string } = { title: "DEFAULT" }) {
  return note.title; // @trace fpl-default backward note.title @no-produces fpl-default @produces-open fpl-default
}
export function Defaulted() {
  return <p>{show({ title: "GIVEN" })}</p>;
}

// A getter read without its call reads the function, not the signal's value.
export function Arity() {
  const [get] = createSignal({ length: 100 });
  return <p>{get.length}</p>; // @trace fpl-arity backward get.length @no-produces fpl-arity
}

// A later computed member at an inner level keeps that level open.
export function InnerComputed(props: { key: string }) {
  const obj = { nested: { title: "OLD" }, [props.key]: { title: "NEW" } };
  return <p>{obj.nested.title}</p>; // @trace fpl-inner-computed backward obj.nested.title @no-produces fpl-inner-computed @produces-open fpl-inner-computed
}
