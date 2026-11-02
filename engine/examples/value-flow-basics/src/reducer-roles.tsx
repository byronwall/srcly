// React is not installed here: the engine knows `useReducer` by its import's module.
import { createContext, useContext, useReducer } from "react";

// However a dispatch reaches its call, directly, through a prop or through a
// context, it runs the reducer: the action is the reducer's parameter, and only
// what the reducer returns is the state. A reducer that ignores its action
// leaves that action out of the state. A function given to a dispatch is an
// action too: nothing calls it, unlike a setter's updater.
type Action = { name: string };

function constant(_state: string, _action: Action) { // @reaches context-constant parameter
  return "fixed";
}

function keeps(_state: string, action: Action) {
  return action.name;
}

const Dispatch = createContext<(action: Action) => void>(() => {});

function Reader(props: { name: string }) {
  const dispatch = useContext(Dispatch);
  dispatch({ name: props.name }); // @trace context-constant forward props.name
  return null;
}

export function Provided(props: { name: string }) {
  const [state, dispatch] = useReducer(constant, "seed");
  return (
    <Dispatch.Provider value={dispatch}>
      {/* @never-reaches context-constant */}
      <p>{state}</p>
      <Reader name={props.name} />
    </Dispatch.Provider>
  );
}

const Kept = createContext<(action: Action) => void>(() => {});

function KeptReader(props: { name: string }) {
  const dispatch = useContext(Kept);
  dispatch({ name: props.name }); // @trace context-keeps forward props.name
  return null;
}

export function ProvidedKeeps(props: { name: string }) {
  const [state, dispatch] = useReducer(keeps, "seed");
  return (
    <Kept.Provider value={dispatch}>
      {/* @reaches context-keeps render-terminal */}
      <p>{state}</p>
      <KeptReader name={props.name} />
    </Kept.Provider>
  );
}

export function FunctionAction(props: { name: string }) {
  const [state, dispatch] = useReducer(constant, "seed");
  dispatch((() => props.name) as unknown as Action); // @trace function-action forward props.name @reaches function-action return
  return <p>{state}</p>; // @never-reaches function-action
}
