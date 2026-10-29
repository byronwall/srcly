import { createEffect, createMemo, mergeProps, on, splitProps } from "solid-js";
import { createAsync } from "@solidjs/router";

// What Solid's own calls do with a value is modelled, not assumed: a memo or
// `createAsync` yields what its callback returns, `on` calls its callback
// with what its source returns, `splitProps` and `mergeProps` carry the
// props they are given, and an effect's own value is unused.
async function lookup(key: string) {
  return { key };
}

export function Derived(props: { name: string; key: string; extra: number }) {
  const label = createMemo(() => `${props.name}!`); // @trace ff-memo forward props.name @outcome ff-memo ok
  const found = createAsync(() => lookup(props.key)); // @trace ff-async forward props.key @outcome ff-async ok
  const [local] = splitProps(props, ["name"]); // @trace ff-split forward props
  const merged = mergeProps({ extra: 1 }, props); // @trace ff-merge forward props
  createEffect(on(() => props.extra, (extra) => console.log(extra))); // @trace ff-effect forward props.extra @reaches ff-effect
  return (
    <p>
      {/* @reaches ff-memo render-terminal @reaches ff-async render-terminal */}
      {label()} {found()?.key}
      {/* @reaches ff-split render-terminal @reaches ff-merge render-terminal */}
      {local.name} {merged.extra}
    </p>
  );
}
