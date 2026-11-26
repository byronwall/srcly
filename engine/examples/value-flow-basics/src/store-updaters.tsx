import { createStore } from "solid-js/store";

// A setter handed a function as the value stores what it returns; a function
// that is a member of an object the setter is handed is stored as it is.
// The producer oracle runs both.

export function UpdaterIntoOtherStore(props: { named: string }) {
  const [one, setOne] = createStore({ head: { title: "" } }); // @produces su-other initialization proven
  const rename = () => props.named;
  setOne("head", "title", rename); // @produces su-other write partial @caveat su-other callback
  const [two] = createStore({ head: one.head });
  return <b>{two.head.title}</b>; // @trace su-other backward two.head.title
}

export function StoredHandler() {
  const handler = () => "clicked";
  const [store, setStore] = createStore({ handler: () => "initial" }); // @produces su-handler initialization proven
  setStore({ handler }); // @produces su-handler write partial @no-caveat su-handler
  return <button onClick={store.handler}>go</button>; // @trace su-handler backward store.handler
}
