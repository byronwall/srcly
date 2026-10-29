import { createContext, useContext } from "solid-js";

// `useContext(Ctx)` returns what a `<Ctx.Provider value={…}>` above it
// provides, so a provided value reaches the components that read it.
const Theme = createContext("light");

function Badge() {
  const theme = useContext(Theme);
  return <b>{theme}</b>; // @reaches provided render-terminal
}

export function App(props: { theme: string }) {
  {/* @trace provided forward props.theme */}
  return <Theme.Provider value={props.theme}><Badge /></Theme.Provider>; // @reaches provided dom-terminal
}
