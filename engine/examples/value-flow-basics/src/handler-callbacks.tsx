// React is not installed here: the engine knows the state factory by the module its import names.
import { useState } from "react";

// A callback written inside a handler that a caller hands in
// (`list.map((t) => …)` in `edit`) returns to its own call, not to the call
// that ran the handler: the edited row reaches the list's state and its
// render. Before, the walk stopped at the callback's return. A handler no
// occurrence hands to `Row` is never run.
type Item = { id: string; text: string };
function Row(props: { item: Item; onEdit: (id: string, text: string) => void }) {
  return <input value={props.item.text} onChange={(e) => props.onEdit(props.item.id, e.target.value)} />; // @trace nested-return forward e.target.value @outcome nested-return ok @reaches nested-return dom-terminal
}
export function List() {
  const [items, setItems]: [Item[], (next: (list: Item[]) => Item[]) => void] = useState<Item[]>([]);
  const edit = (id: string, text: string) => setItems((list: Item[]) => list.map((t) => (t.id === id ? { ...t, text } : t))); // @path nested-return "t.id === id ? { ...t, text } : t" "list.map((t) => (t.id === id ? { ...t, text } : t))"
  return <>{items.map((item) => <Row key={item.id} item={item} onEdit={edit} />)}</>; // @reaches nested-return component-occurrence
}
export function Unused() {
  const log = (id: string, text: string) => console.log(id, text); // @never-reaches nested-return
  return <button onClick={() => log("a", "b")}>log</button>;
}
