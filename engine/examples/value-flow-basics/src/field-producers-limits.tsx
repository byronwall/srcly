import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { useState } from "react";

// Where a field's producer is not one sure expression. A hard stop (a pack
// with no field there, a path too deep to name, an operand, a call nothing
// returns into) ends the path and leaves the answer open (`producersOpen`).
// A soft stop (another caller, a changed object, a default, an unnamed member,
// a partial return, an overridable method) lets the walk go on and marks what
// it finds as a candidate with a `@caveat`.
type Note = { id: string; title: string; tags: string[] };
declare function externalNote(): Note;

export function ArrayLength() {
  const xs = ["ONE"];
  return <p>{xs.length}</p>; // @trace fpl-length backward xs.length @produces-open fpl-length @no-produces fpl-length
}

export function ComputedKey(props: { key: string }) {
  const obj = { [props.key]: { title: "INNER" } }; // @produces fpl-computed none proven @caveat fpl-computed unnamed-member
  return <p>{obj.title}</p>; // @trace fpl-computed backward obj.title
}

export function TooDeep() {
  const deep = { a: { b: { c: { d: { title: "RIGHT" } } } } };
  return <p>{deep.a.b.c.d.title}</p>; // @trace fpl-deep backward deep.a.b.c.d.title @produces-open fpl-deep @no-produces fpl-deep
}

export function SpreadAfter() {
  const note = { title: "STALE", ...externalNote() }; // @produces fpl-spread-after none proven @caveat fpl-spread-after unnamed-member
  return <p>{note.title}</p>; // @trace fpl-spread-after backward note.title @produces-open fpl-spread-after
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
  if (p) return id({ title: "A" }); // @produces fpl-two-calls return proven @caveat fpl-two-calls callers @caveat fpl-two-calls mutable
  return { title: id({ title: "never" }).title.toUpperCase() }; // @produces fpl-two-calls return proven @caveat fpl-two-calls callers @caveat fpl-two-calls mutable
}
export function TwoCalls(props: { p: boolean }) {
  const picked = pick(props.p);
  return <p>{picked.title}</p>; // @trace fpl-two-calls backward picked.title
}

// A store seeded from another store's spread: the other store's writes are not this one's.
export function OtherStore() {
  const [one, setOne] = createStore({ title: "FIRST" }); // @produces fpl-other-store initialization proven @caveat fpl-other-store unnamed-member
  const [two] = createStore({ ...one });
  setOne("title", "FIRST_STORE_ONLY"); // @produces fpl-other-store initialization partial @caveat fpl-other-store unnamed-member
  return <p>{two.title}</p>; // @trace fpl-other-store backward two.title
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

// The seed handed to the setter again: an object passed to a call may be changed there, a caveat on both its first value and its write.
export function ReusedSeed() {
  const v = { title: "REUSED" }; // @produces fpl-reused initialization proven @caveat fpl-reused mutable @produces fpl-reused write partial
  const [s, setS] = createStore(v);
  setS(v);
  return <p>{s.title}</p>; // @trace fpl-reused backward s.title
}

// One helper, two calls on two branches: the candidate it finds carries the callers caveat.
function twice(p: boolean) {
  if (p) return id({ title: "A" }); // @produces fpl-helper return proven @caveat fpl-helper callers @caveat fpl-helper mutable
  return id({ title: "B" });
}
export function TwoBranchesOneHelper(props: { p: boolean }) {
  const got = twice(props.p);
  return <p>{got.title}</p>; // @trace fpl-helper backward got.title
}

// An operand is no field of the result: a template's length, a ternary's condition.
export function Operands(props: { guard: { title: string } | null; a: Note; b: Note }) { // @stop fpl-ternary untraced parameter
  const text = `${{ length: 100 }}`;
  const chosen = props.guard ? props.a : props.b;
  return <p>{text.length} {chosen.title}</p>; // @trace fpl-template backward text.length @trace fpl-ternary backward chosen.title @produces-open fpl-template @no-produces fpl-template @produces-open fpl-ternary @no-produces fpl-ternary
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

// A nested field written later: its first value is a candidate, with the object's change as a caveat.
export function NestedWrite() {
  const doc = { note: { title: "OLD" } }; // @produces fpl-nested-write none proven @caveat fpl-nested-write mutable @caveat fpl-nested-write write
  doc.note.title = "NEW";
  return <p>{doc.note.title}</p>; // @trace fpl-nested-write backward doc.note.title
}

// A destructured parameter, or one with a default, holds a value the evidence does not name exactly.
function readPayload({ payload }: { payload: { title: string }; title: string }) {
  return payload.title; // @trace fpl-destructured backward payload.title
}
export function Destructured() {
  return <p>{readPayload({ payload: { title: "INNER" }, title: "OUTER" })}</p>; // @produces fpl-destructured none proven @caveat fpl-destructured binding
}
function show(note: { title: string } = { title: "DEFAULT" }) {
  return note.title; // @trace fpl-default backward note.title
}
export function Defaulted() {
  return <p>{show({ title: "GIVEN" })}</p>; // @produces fpl-default none proven @caveat fpl-default binding
}

// A getter read without its call reads the function, not the signal's value.
export function Arity() {
  const [get] = createSignal({ length: 100 });
  return <p>{get.length}</p>; // @trace fpl-arity backward get.length @produces-open fpl-arity @no-produces fpl-arity
}

// A later computed member at an inner level is a caveat on the named one.
export function InnerComputed(props: { key: string }) {
  const obj = { nested: { title: "OLD" }, [props.key]: { title: "NEW" } }; // @produces fpl-inner-computed none proven @caveat fpl-inner-computed unnamed-member
  return <p>{obj.nested.title}</p>; // @trace fpl-inner-computed backward obj.nested.title @produces-open fpl-inner-computed
}

// A rest parameter is an array of the arguments, not the first one.
function total(...parts: { length: number }[]) {
  return parts.length; // @trace fpl-rest backward parts.length
}
export function Rest() {
  return <p>{total({ length: 100 }, { length: 200 })}</p>; // @produces fpl-rest none proven @caveat fpl-rest binding
}

// A branch whose object has no such field leaves the read undefined there.
function maybeTitle(flag: boolean) {
  if (flag) return { title: "SET" }; // @produces fpl-missing return proven
  return {};
}
export function Missing(props: { flag: boolean }) {
  const loaded = maybeTitle(props.flag);
  return <p>{(loaded as { title?: string }).title}</p>;
}
export function MissingRead(props: { flag: boolean }) {
  const loaded: { title?: string } = maybeTitle(props.flag);
  return <p>{loaded.title}</p>; // @trace fpl-missing backward loaded.title @produces-open fpl-missing
}

// A handler the page calls with its own event: its one explicit call's argument is not the only value.
function onAction(evt: { type: string }) {
  return evt.type; // @trace fpl-handler backward evt.type
}
export function Handler() {
  onAction({ type: "manual" }); // @produces fpl-handler none proven @caveat fpl-handler callers
  return <button onClick={onAction}>go</button>;
}

// An object changed after it is built, however the write is spelled.
export function Mutated() {
  const doc = { note: { title: "OLD" } }; // @produces fpl-mutated none proven @caveat fpl-mutated mutable
  doc.note["title"] = "NEW";
  return <p>{doc.note.title}</p>; // @trace fpl-mutated backward doc.note.title
}
export function Assigned() {
  const note = { title: "OLD" }; // @produces fpl-assigned none proven @caveat fpl-assigned mutable
  Object.assign(note, { title: "NEW" });
  return <p>{note.title}</p>; // @trace fpl-assigned backward note.title
}

// A function whose end can be reached returns undefined there too.
function sometimes(ok: boolean) {
  if (ok) return { title: "SET" }; // @produces fpl-fallthrough return proven @caveat fpl-fallthrough fallthrough
}
export function FallsThrough(props: { ok: boolean }) {
  const got = sometimes(props.ok);
  return <p>{got?.title}</p>; // @trace fpl-fallthrough backward got?.title
}

// A generator's call is an iterator: what it yields is no field of it.
function* pages() {
  yield { next: 123 }; // @produces fpl-generator return proven @caveat fpl-generator fallthrough @caveat fpl-generator mutable
}
export function Iterator() {
  const it = pages();
  return <p>{String(it.next)}</p>; // @trace fpl-generator backward it.next
}

// A returned object changed in the caller, through `Object.assign` on a property chain.
function makeDoc() {
  return { note: { title: "OLD" } }; // @produces fpl-assign-chain return proven @caveat fpl-assign-chain mutable
}
export function AssignedChain() {
  const doc = makeDoc();
  Object.assign(doc.note, { title: "NEW" });
  return <p>{doc.note.title}</p>; // @trace fpl-assign-chain backward doc.note.title
}

// An argument after a spread is not at the position its binding names.
function second(_a: { title: string }, b: { title: string }) {
  return b.title; // @trace fpl-spread-arg backward b.title
}
export function SpreadArgs() {
  const pair: [{ title: string }] = [{ title: "ONE" }];
  return <p>{second(...pair, { title: "TWO" })}</p>; // @produces fpl-spread-arg none proven @caveat fpl-spread-arg binding
}

// Every branch returns: the function never ends without a return.
function either(ok: boolean) {
  if (ok) {
    return { title: "A" }; // @produces fpl-either return proven
  } else {
    return { title: "B" }; // @produces fpl-either return proven
  }
}
export function Either(props: { ok: boolean }) {
  const got = either(props.ok);
  return <p>{got.title}</p>; // @trace fpl-either backward got.title
}

// An async function's call is a promise: its returned object's field is the field only once awaited.
async function loadStatus() {
  return { status: "READY" }; // @produces fpl-awaited return proven @produces fpl-pending return proven @caveat fpl-pending fallthrough
}
export function Pending() {
  const pending = loadStatus();
  return <p>{String((pending as unknown as { status: string }).status)}</p>;
}
export async function Awaited() {
  const done = await loadStatus();
  return done.status; // @trace fpl-awaited backward done.status
}
export function PendingRead() {
  const pending = loadStatus() as unknown as { status: string };
  return <p>{pending.status}</p>; // @trace fpl-pending backward pending.status
}

// A plain object seed of a state that can also take a function: that object is the first value.
export function ObjectSeed() {
  const [draft, setDraft] = useState({ title: "FIRST" }); // @produces fpl-object-seed initialization proven
  // @trace fpl-object-seed backward draft.title
  return <input value={draft.title} onInput={() => setDraft({ title: "NEXT" })} />; // @produces fpl-object-seed write partial
}

// An async function that can end without returning: awaited, it still yields undefined there.
async function loadMaybe(ok: boolean) {
  if (ok) return { title: "SET" }; // @produces fpl-await-maybe return proven @caveat fpl-await-maybe fallthrough
}
export async function AwaitedMaybe(props: { ok: boolean }) {
  const maybe = await loadMaybe(props.ok);
  return maybe?.title; // @trace fpl-await-maybe backward maybe?.title
}

// Written through a fallback that may be this object.
export function ThroughFallback(props: { incoming?: { title: string } }) {
  const fallback = { title: "OLD" }; // @produces fpl-fallback-write none proven @caveat fpl-fallback-write mutable
  const chosen = props.incoming ?? fallback;
  chosen.title = "NEW";
  return <p>{fallback.title}</p>; // @trace fpl-fallback-write backward fallback.title
}

// Every switch clause returns: no fallthrough.
function byStatus(status: string) {
  switch (status) {
    case "active":
      return { title: "ACTIVE" }; // @produces fpl-switch return proven
    default:
      return { title: "OTHER" }; // @produces fpl-switch return proven
  }
}
export function Switched(props: { status: string }) {
  const shown = byStatus(props.status);
  console.log(shown.title);
  return <p>{shown.title}</p>; // @trace fpl-switch backward shown.title
}

// A break inside a clause can leave the switch, and the function, without a return.
function found(key: string, ok: boolean) {
  switch (key) {
    case "found":
      if (!ok) break;
      return { title: "SET" }; // @produces fpl-break return proven @caveat fpl-break fallthrough
    default:
      throw new Error("missing");
  }
}
export function Breaks(props: { ok: boolean }) {
  const n = found("found", props.ok);
  return <p>{n?.title}</p>; // @trace fpl-break backward n?.title
}

// A reference handed out of a function can be written wherever it goes.
export function Escaped() {
  const n = { title: "OLD" }; // @produces fpl-escaped none proven @caveat fpl-escaped mutable
  const get = () => n;
  Object.assign(get(), { title: "NEW" });
  return <p>{n.title}</p>; // @trace fpl-escaped backward n.title
}

// A functional update is a later write too.
export function Updated() {
  const [n, setN] = useState({ title: "FIRST" }); // @produces fpl-updated initialization proven
  // @trace fpl-updated backward n.title
  return <button onClick={() => setN((prev) => ({ ...prev, title: "NEXT" }))}>{n.title}</button>; // @produces fpl-updated write partial
}

// A class method can be overridden: the receiver's class decides which return runs.
class Base {
  load() {
    return { title: "BASE" }; // @produces fpl-override return proven @caveat fpl-override receiver
  }
}
export function Overridden(props: { repo: Base }) {
  const loaded = props.repo.load();
  return <p>{loaded.title}</p>; // @trace fpl-override backward loaded.title
}

// An optional call may not run: then the value is undefined.
function loadSet() {
  return { title: "SET" };
}
export function OptionalCall(props: { repo?: { load: typeof loadSet } }) { // @stop fpl-optional untraced parameter
  const maybe = props.repo?.load();
  return <p>{maybe?.title}</p>; // @trace fpl-optional backward maybe?.title @produces-open fpl-optional @no-produces fpl-optional
}

// A function that can be replaced may run another body.
function defaults() {
  return { theme: "light" }; // @produces fpl-replaced return proven @caveat fpl-replaced receiver
}
const service = { load: defaults };
service.load = () => ({ theme: "dark" });
export function Replaced() {
  const settings = service.load();
  return <p>{settings.theme}</p>; // @trace fpl-replaced backward settings.theme
}

// An object handed to a component may be changed through its props.
function TitleEditor(props: { note: { title: string } }) {
  props.note.title = "edited";
  return <i>{props.note.title}</i>;
}
export function PassedToChild() {
  const note = { title: "initial" }; // @produces fpl-passed none proven @caveat fpl-passed mutable
  return <p><TitleEditor note={note} />{note.title}</p>; // @trace fpl-passed backward note.title
}

// A method that writes its own object.
export function SelfPatched() {
  const state = { value: "old", apply(patch: { value: string }) { Object.assign(this, patch); } }; // @produces fpl-self none proven @caveat fpl-self mutable
  state.apply({ value: "new" });
  return <p>{state.value}</p>; // @trace fpl-self backward state.value
}
