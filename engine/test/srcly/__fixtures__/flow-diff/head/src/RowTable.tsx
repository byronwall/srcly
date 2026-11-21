import { createResource, For } from "solid-js";
import { loadRows } from "./rows";

export function RowTable() {
  const [rows] = createResource(loadRows);
  return <ul><For each={rows()}>{(row) => <li>{row.label}</li>}</For></ul>;
}
