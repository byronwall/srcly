import { batch, createEffect, createMemo, createRenderEffect, createSelector, on, onCleanup, onMount, untrack, createMemo as memo, createSignal as signal } from "solid-js";

// Each Solid call yields its own kind of value. An effect's call has none, and
// its callback's return is not one. `onCleanup` returns the function it is
// given, so calling that runs it. `on` returns a new function: calling it runs
// the callback, and building it runs nothing. A selector's call is a boolean
// test, not its source's value. `batch` and `untrack` do yield what their
// callback returns.
export function Effects(props: { token: string; other: string; third: string }) {
  const effect = createEffect(() => props.token); // @trace solid-effect forward props.token @reaches solid-effect return @no-path solid-effect "props.token" "effect"
  console.log(effect); // @never-reaches solid-effect
  const render = createRenderEffect(() => props.other); // @trace solid-render forward props.other @reaches solid-render return
  console.log(render); // @never-reaches solid-render
  const mounted = onMount(() => props.third); // @trace solid-mount forward props.third @reaches solid-mount return
  console.log(mounted); // @never-reaches solid-mount
}

export function Cleanup(props: { token: string }) {
  const held = onCleanup(() => props.token); // @trace solid-cleanup forward props.token @no-path solid-cleanup "props.token" "held"
  const ran = held(); // @path solid-cleanup "props.token" "ran"
  console.log(ran); // @reaches solid-cleanup stdout @reaches solid-cleanup external-effect
}

export function Wrapper(props: { n: number; m: number }) {
  const wrapped = on(() => props.n, (n) => n * 2); // @trace solid-on forward props.n
  const value = wrapped(); // @path solid-on "props.n" "value"
  console.log(value); // @reaches solid-on stdout @reaches solid-on external-effect
  // A wrapper nothing calls holds its callback, and nothing comes back.
  // @trace solid-on-idle forward props.m @reaches solid-on-idle return
  on(() => props.m, (m) => m * 2);
}

export function IgnoredSource(props: { skip: number }) {
  // The callback drops its source, so what the wrapper yields owes nothing to it.
  const wrapped = on(() => props.skip, () => "fixed"); // @trace solid-on-ignored forward props.skip @reaches solid-on-ignored return
  const value = wrapped();
  console.log(value); // @never-reaches solid-on-ignored
}

export function WrappedMemo(props: { n: number }) {
  // A memo over `on` yields the callback's return, through the wrapper.
  // @trace solid-memo-on forward props.n @path solid-memo-on "props.n" "doubled"
  const doubled = createMemo(on(() => props.n, (n) => n * 2));
  return <p>{doubled()}</p>; // @reaches solid-memo-on render-terminal
}

export function Selector(props: { id: string; other: string }) {
  // The source shapes the boolean, so a route remains; its first return is no longer the call's.
  // @trace solid-selector forward props.id @no-edge solid-selector return-value proven return-expression
  const isSelected = createSelector(() => props.id);
  const hit = isSelected(props.other);
  return <p>{String(hit)}</p>; // @reaches solid-selector render-terminal
}

export function Returned(props: { a: string; b: string }) {
  const first = batch(() => props.a); // @trace solid-batch forward props.a @path solid-batch "props.a" "first"
  const second = untrack(() => props.b); // @trace solid-untrack forward props.b @path solid-untrack "props.b" "second"
  console.log(first); // @reaches solid-batch stdout @reaches solid-batch external-effect
  console.log(second); // @reaches solid-untrack stdout @reaches solid-untrack external-effect
}

export function Renamed(props: { name: string; title: string }) {
  const [get, set] = signal(""); // @visits solid-renamed-signal alias
  const label = memo(() => props.title); // @trace solid-renamed-memo forward props.title @outcome solid-renamed-memo ok
  set(props.name); // @trace solid-renamed-signal forward props.name @outcome solid-renamed-signal ok
  return <p>{get()}{label()}</p>; // @reaches solid-renamed-signal render-terminal @reaches solid-renamed-memo render-terminal
}
