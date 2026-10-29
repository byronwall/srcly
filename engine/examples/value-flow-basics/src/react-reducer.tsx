// React is not installed here: the engine knows `useReducer` by its import's module.
import { useMemo, useReducer, useRef } from "react";

type Action = { type: "rename"; name: string };

// A reducer pair: `dispatch(action)` calls the reducer with the action, and
// what the reducer returns is the state the pair's first half reads. The
// initial value seeds that state. A ref and a memo carry their value through.
function reducer(state: { name: string }, action: Action) { // @visits dispatch parameter "action"
  return { name: action.name }; // @visits dispatch return
}

export function Renamer(props: { name: string; next: string }) {
  const [state, dispatch] = useReducer(reducer, { name: props.name }); // @trace reducer-init forward props.name
  const rename = () => dispatch({ type: "rename", name: props.next }); // @trace dispatch forward props.next
  return <button onClick={rename}>{state.name}</button>; // @reaches reducer-init,dispatch render-terminal
}

export function Remembered(props: { value: string }) {
  const ref = useRef(props.value); // @trace ref-value forward props.value
  return <p>{ref.current}</p>; // @reaches ref-value render-terminal
}

export function Memo(props: { text: string }) {
  const upper = useMemo(() => props.text.toUpperCase(), [props.text]); // @trace memo-value forward props.text
  return <p>{upper}</p>; // @reaches memo-value render-terminal
}
