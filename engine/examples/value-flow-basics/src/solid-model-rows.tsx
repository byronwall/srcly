import { createDeferred, createRoot, createSignal, mapArray, splitProps } from "solid-js";
// The storage package is not installed here: the engine knows it by the module its import names.
import { makePersisted } from "@solid-primitives/storage";

// A call a flow row describes is modelled, never an assumed external effect.
// `createDeferred` makes an accessor of what its callback returns. `mapArray`
// hands each item of its source to its callback, and its accessor yields what
// the callback returns. `createRoot` yields what its callback returns.
export function Deferred(props: { text: string }) {
  const later = createDeferred(() => props.text); // @trace smr-deferred forward props.text @outcome smr-deferred ok @path smr-deferred "props.text" "later"
  return <p>{later()}</p>; // @reaches smr-deferred render-terminal
}

export function Mapped(props: { names: string[]; other: string[] }) {
  // @trace smr-map forward props.names @outcome smr-map ok @path smr-map "props.names" "name" @path smr-map "name" "upper"
  const upper = mapArray(() => props.names, (name) => name.toUpperCase());
  // The callback drops its item, so the list owes nothing to the source.
  // @trace smr-map-ignored forward props.other @outcome smr-map-ignored ok @reaches smr-map-ignored parameter @no-path smr-map-ignored "props.other" "fixed"
  const fixed = mapArray(() => props.other, (_item) => "x");
  return <p>{upper().join(", ")}{fixed().length}</p>; // @reaches smr-map render-terminal @never-reaches smr-map-ignored
}

export function Rooted(props: { start: number }) {
  const held = createRoot(() => props.start + 1); // @trace smr-root forward props.start @outcome smr-root ok @path smr-root "props.start" "held"
  return <p>{held}</p>; // @reaches smr-root render-terminal
}

// A pair handed through a `passes-through` row at one argument is still that
// pair: the setter's value reaches the getter's reads. The options are not
// part of the value.
export function Persisted(props: { next: string; key: string }) {
  // @trace smr-persist-key forward props.key @no-path smr-persist-key "props.key" "theme" @stop smr-persist-key disconnected object-pack
  const [theme, setTheme] = makePersisted(createSignal("light"), { name: props.key });
  const save = () => setTheme(props.next); // @trace smr-persist forward props.next @outcome smr-persist ok @path smr-persist "props.next" "theme"
  return <p onClick={save}>{theme()}</p>; // @reaches smr-persist render-terminal @never-reaches smr-persist-key
}

// The keys `splitProps` is given pick fields. They are not part of what the halves carry.
export function Split(props: { name: string; pick: "name" }) {
  const [local] = splitProps(props, [props.pick]); // @trace smr-split-keys forward props.pick @no-path smr-split-keys "props.pick" "local" @stop smr-split-keys disconnected object-pack
  return <p>{local.name}</p>; // @never-reaches smr-split-keys
}
