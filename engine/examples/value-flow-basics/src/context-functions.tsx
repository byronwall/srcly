// A context's value may be the function a call runs: a reducer's dispatch
// (`const dispatch = useContext(Dispatch)`), or a method a reader destructures
// (`const { rename } = useContext(Names)`). The call runs what each provider
// hands in.
import { createContext, useContext, useReducer, useState } from "react";

type Act = { name: string };
const Dispatch = createContext<(action: Act) => void>(() => {});
function reducer(state: string, action: Act) {
  return action.name || state;
}
function Renamer(props: { next: string }) {
  const dispatch = useContext(Dispatch);
  return <button onClick={() => dispatch({ name: props.next })}>rename</button>; // @trace ctx-dispatch forward props.next @outcome ctx-dispatch ok
}
export function DispatchRoot() {
  const [name, dispatch] = useReducer(reducer, "");
  return <Dispatch.Provider value={dispatch}><Renamer next="b" /><b>{name}</b></Dispatch.Provider>; // @reaches ctx-dispatch render-terminal
}

const Names = createContext({ rename: (_name: string) => {} });
function Picker(props: { next: string }) {
  const { rename } = useContext(Names);
  return <button onClick={() => rename(props.next)}>pick</button>; // @trace ctx-member forward props.next @outcome ctx-member ok
}
export function NamesRoot() {
  const [name, setName] = useState("");
  return <Names.Provider value={{ rename: (next: string) => setName(next) }}><Picker next="c" /><i>{name}</i></Names.Provider>; // @reaches ctx-member render-terminal
}
