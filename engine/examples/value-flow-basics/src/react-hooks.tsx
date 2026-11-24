// React is not installed here: the engine knows its hooks by the module their imports name.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

// `useSyncExternalStore(subscribe, getSnapshot)`: the value is what
// `getSnapshot` returns. What `subscribe` is given or returns is not it.
let mode = "light";
const listeners = new Set<() => void>();
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify); // @never-reaches store-read
}
export function setMode(next: string) {
  mode = next;
  listeners.forEach((notify) => notify());
}
function readMode() {
  return mode === "dark" ? "dark" : "light"; // @visits store-read literal
}
export function ModeBadge() {
  const current = useSyncExternalStore(subscribe, readMode);
  return <span>{current}</span>; // @trace store-read backward current @outcome store-read ok
}

// An effect has no value, and a wrapper's value is only the function it
// wraps: their dependency lists end in place as the hook's input, as a
// `useMemo` list does. Neither is an assumed library call.
export function Saver(props: { draft: string; save: (draft: string) => void }) {
  useEffect(() => {
    console.log(props.draft);
  }, [props.draft]); // @trace effect-dep forward props.draft @outcome effect-dep ok @reaches effect-dep object-pack @no-edge effect-dep * * external-call
  const save = () => props.save(props.draft);
  const onSave = useCallback(save, [props.draft]); // @trace wrapper-dep forward props.draft @outcome wrapper-dep ok @reaches wrapper-dep object-pack @no-edge wrapper-dep * * external-call
  return <button onClick={onSave}>save</button>;
}

// `useRef(x)` makes an object whose `current` holds `x`; no other field holds it.
export function Latest(props: { message: string }) {
  const latest = useRef(props.message); // @trace ref-initial forward props.message @outcome ref-initial ok
  console.log(latest.current); // @reaches ref-initial stdout @reaches ref-initial external-effect
  console.log(latest.previous); // @never-reaches ref-initial field-read
  return null;
}

// What `useMemo` binds is what its callback returns, not the callback: the
// callback's return reaches the memo's reads, with no hand-off to calls of it.
export function Ids(props: { rows: { id: string }[] }) {
  const ids: string[] = useMemo(() => props.rows.map((row) => row.id), [props.rows]); // @trace memo-map forward props.rows @outcome memo-map ok @no-edge memo-map * * external-call
  return <p>{ids.join(", ")}</p>; // @reaches memo-map render-terminal
}
