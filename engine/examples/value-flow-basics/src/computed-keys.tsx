// A computed key in an object literal picks a field, as `obj[k]` does: the
// key ends there, and the value under it carries on. `createSelector` makes
// an accessor that tests a key against what its source returns.
import { createSelector, For } from "solid-js";

export function totals(rows: { k: string; n: number }[]) { // @trace computed-key forward symbol rows @outcome computed-key ok
  return rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.k]: (acc[row.k] ?? 0) + row.n }), {}); // @reaches computed-key return @reaches computed-key field-read
}

export function Rows(props: { active: string; rows: string[] }) {
  const isActive = createSelector(() => props.active); // @trace selector forward props.active @outcome selector ok
  return <For each={props.rows}>{(row) => <p classList={{ on: isActive(row) }}>{row}</p>}</For>; // @reaches selector dom-terminal
}
