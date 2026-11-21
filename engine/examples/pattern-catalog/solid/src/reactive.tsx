import { batch, createDeferred, createEffect, createMemo, createRoot, createSignal, For, indexArray, mapArray, on, onCleanup, untrack } from "solid-js";

// S74 memo chain
export function Chain(props: { price: number }) { // @trace s-memo-chain forward props.price @want render-terminal
  const net = createMemo(() => props.price * 0.8);
  const gross = createMemo(() => net() * 1.2);
  const label = createMemo(() => `$${gross().toFixed(2)}`);
  return <p>{label()}</p>;
}

// S75 untrack read still carries the value
export function Snapshot(props: { seed: string }) { // @trace s-untrack forward props.seed @want render-terminal
  const [value] = createSignal(untrack(() => props.seed));
  return <p>{value()}</p>;
}

// S76 on() with defer and the previous input
export function Diff(props: { value: number }) { // @trace s-on-prev forward props.value @want render-terminal
  const [delta, setDelta] = createSignal(0);
  createEffect(on(() => props.value, (value, prev) => setDelta(value - (prev ?? 0)), { defer: true }));
  return <p>{delta()}</p>;
}

// S77 createDeferred
export function Slow(props: { text: string }) { // @trace s-deferred forward props.text @want render-terminal
  const deferred = createDeferred(() => props.text);
  return <p>{deferred()}</p>;
}

// S78 mapArray
export function Mapped(props: { names: string[] }) { // @trace s-map-array forward props.names @want render-terminal
  const upper = mapArray(() => props.names, (name) => name.toUpperCase());
  return <p>{upper().join(", ")}</p>;
}

// S79 indexArray
export function Indexed(props: { names: string[] }) { // @trace s-index-array forward props.names @want render-terminal
  const lengths = indexArray(() => props.names, (name) => name().length);
  return <p>{lengths().join(", ")}</p>;
}

// S80 createRoot returns a value built inside it
export function Rooted(props: { start: number }) { // @trace s-create-root forward props.start @want render-terminal
  const count = createRoot(() => {
    const [n] = createSignal(props.start);
    return n;
  });
  return <p>{count()}</p>;
}

// S81 controlled input with a derived signal
export function Shout() {
  const [text, setText] = createSignal("");
  const loud = () => text().toUpperCase();
  return <div><input onInput={(e) => setText(e.currentTarget.value)} /><p>{loud()}</p></div>; // @trace s-controlled-derived forward e.currentTarget.value @want render-terminal
}

// S82 FormData form submit
export function Signup() {
  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    void fetch("/api/signup", { method: "POST", body: JSON.stringify({ email: data.get("email") }) }); // @trace s-formdata forward data.get("email") @want external-effect
  };
  return <form onSubmit={submit}><input name="email" /></form>;
}

// S83 bound event array
export function Remove(props: { id: string }) { // @trace s-bound-event forward props.id @want external-effect
  const remove = (id: string, _e: MouseEvent) => void fetch(`/api/remove/${id}`, { method: "DELETE" });
  return <button onClick={[remove, props.id]}>x</button>;
}

// S84 event delegation through a data attribute
export function Menu(props: { items: string[] }) {
  const [picked, setPicked] = createSignal("");
  const pick = (e: MouseEvent) => setPicked((e.target as HTMLElement).dataset.id ?? "");
  return <ul onClick={pick}><For each={props.items}>{(item) => <li data-id={item}>{item}</li>}</For><b>{picked()}</b></ul>; // @trace s-delegation backward picked() @want external-read|parameter
}

// S85 ref callback
export function Measure(props: { width: number }) { // @trace s-ref-fn forward props.width @want dom-terminal|external-effect|write
  return <div ref={(el) => { el.style.width = `${props.width}px`; }} />;
}

// S86 use: directive with an accessor argument
function tooltip(el: HTMLElement, text: () => string) {
  el.title = text();
}
declare module "solid-js" {
  namespace JSX {
    interface Directives { tooltip: string }
  }
}
export function Hinted(props: { hint: string }) { // @trace s-directive forward props.hint @want dom-terminal|external-effect|write
  void tooltip;
  return <span use:tooltip={props.hint}>?</span>;
}

// S87 classList and style objects
export function Chip(props: { active: boolean; color: string }) { // @trace s-style-object forward props.color @want dom-terminal
  return <span classList={{ active: props.active }} style={{ color: props.color }}>chip</span>;
}

// S88 an interval writes a signal, with cleanup
export function Clock(props: { step: number }) { // @trace s-interval-cleanup forward props.step @want render-terminal
  const [ticks, setTicks] = createSignal(0);
  const timer = setInterval(() => setTicks((t) => t + props.step), 1000);
  onCleanup(() => clearInterval(timer));
  return <time>{ticks()}</time>;
}

// S89 batch returns a value used later
export function Batched(props: { a: number }) { // @trace s-batch-return forward props.a @want render-terminal
  const [sum, setSum] = createSignal(0);
  const run = () => setSum(batch(() => props.a + 1));
  return <p onClick={run}>{sum()}</p>;
}

// S90 effect that writes the document title
export function Title(props: { title: string }) { // @trace s-effect-document forward props.title @want external-effect|write|dom-terminal
  createEffect(() => { document.title = props.title; });
  return null;
}
