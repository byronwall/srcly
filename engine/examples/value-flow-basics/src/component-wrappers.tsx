// React and the query library are not installed here: the engine knows them by the module their imports name.
import { forwardRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dynamic } from "solid-js/web";

// A component wrapped where it is declared is still a component: its first
// parameter is its props, even when `forwardRef` passes a ref second. A
// `<Dynamic component={…}>` renders that component with its other attributes.
// A query's value is what its `queryFn` returns, and `mutate(x)` calls the
// `mutationFn` with `x`.
const Field = forwardRef((props: { label: string }, ref) => <label ref={ref}>{props.label}</label>); // @reaches wrapped render-terminal

function Badge(props: { text: string }) {
  return <b>{props.text}</b>; // @reaches dynamic render-terminal
}

async function loadNote(id: string) {
  return { id, title: `note ${id}` };
}

async function saveNote(title: string) {
  console.log(title); // @reaches mutated
}

export function Wrapped(props: { label: string }) {
  return <Field label={props.label} />; // @trace wrapped forward props.label @outcome wrapped ok @reaches wrapped component-occurrence
}

export function Dynamo(props: { text: string }) {
  return <Dynamic component={Badge} text={props.text} />; // @trace dynamic forward props.text @outcome dynamic ok @reaches dynamic component-occurrence
}

export function Note(props: { id: string; title: string }) {
  const note = useQuery({ queryKey: ["note"], queryFn: () => loadNote(props.id) }); // @trace queried forward props.id @outcome queried ok
  const save = useMutation({ mutationFn: saveNote });
  // The library is not installed here, so `mutate` has no symbol: an unresolved stop.
  {/* @trace mutated forward props.title @reaches mutated return @stop mutated unresolved-symbol */}
  return <p onClick={() => save.mutate(props.title)}>{note.data?.title}</p>; // @reaches queried render-terminal
}
