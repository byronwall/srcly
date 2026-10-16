// Fixture for tests/test_metric_trust.py: nested functions, display scopes and JSX branches.
import { createSignal } from "solid-js";

const styles = {
  pick: (dark: boolean) => (dark ? "bg-black" : "bg-white"),
};

export class Store {
  items: string[] = [];

  add(item: string) {
    if (!item) return;
    this.items.push(item);
  }
}

export function Panel(props: { rows: string[]; dense?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const label = (row: string) => {
    if (row.length > 40) return row.slice(0, 40);
    if (row.startsWith("#")) return row.slice(1);
    return row;
  };
  return (
    <div>
      {open() ? <ul>{props.rows.map((r) => <li>{label(r)}</li>)}</ul> : null}
      {props.dense && <hr />}
      <button onClick={() => setOpen(!open())}>Toggle</button>
    </div>
  );
}
