import { For, Index, Show, createSignal } from "solid-js";

type Row = { name: string; note: string };

// Render callbacks: `For` hands its callback each item as a value and its
// index as an accessor; `Index` hands each item as an accessor and its index
// as a number. An item never reaches the index's reads, and the index's
// source (the list's position) never stands for an item. A `Show` with a
// callback child hands the `when` value to its parameter as an accessor, or
// as the value itself when it is `keyed`.
export function Lists(props: { rows: Row[]; names: string[]; picked: Row | undefined }) {
  return (
    <section>
      {/* @trace rc-for forward props.rows @outcome rc-for ok */}
      <For each={props.rows}>
        {(row, i) => (
          <p>
            {/* @reaches rc-for render-terminal */}
            <b>{row.name}</b>
            {/* @never-reaches rc-for render-terminal */}
            <i>{i()}</i>
          </p>
        )}
      </For>
      {/* @trace rc-index forward props.names @outcome rc-index ok */}
      <Index each={props.names}>
        {(name, n) => (
          <p>
            {/* @reaches rc-index render-terminal */}
            <b>{name()}</b>
            {/* @never-reaches rc-index render-terminal */}
            <i>{n}</i>
          </p>
        )}
      </Index>
      {/* @trace rc-show forward props.picked @outcome rc-show ok @reaches rc-show branch-condition */}
      <Show when={props.picked}>
        {(row) => <em>{row().note}</em> /* @reaches rc-show render-terminal */}
      </Show>
      {/* @trace rc-keyed forward props.picked @outcome rc-keyed ok @reaches rc-keyed branch-condition */}
      <Show when={props.picked} keyed>
        {(row) => <u>{row.note}</u> /* @reaches rc-keyed render-terminal */}
      </Show>
    </section>
  );
}

// A named render callback is called as an inline one: `For` hands it each item.
export function NamedRender(props: { rows: Row[] }) {
  const line = (row: Row, i: () => number) => <li data-at={i()}>{row.note}</li>; // @reaches rc-named render-terminal @never-reaches rc-named dom-terminal
  return <For each={props.rows}>{line}</For>; // @trace rc-named forward props.rows @outcome rc-named ok
}
