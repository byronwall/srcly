import { createContext, createSignal, useContext } from "solid-js";

// More kinds of handler a caller hands in, and the calls that read them.
export function Picker(props: { label: string; onPick: (label: string) => void }) { // @stop handler-back untraced parameter
  return <button onClick={() => props.onPick(props.label)}>pick</button>;
}

// A state setter handed in as a prop: the call writes the state.
export function Chooser(props: { label: string }) { // @never-reaches handler-back
  const [picked, setPicked] = createSignal("");
  return (
    <div>
      <Picker label={props.label} onPick={setPicked} /> {/* @trace setter-prop forward props.label @reaches setter-prop component-occurrence */}
      <b>{picked()}</b> {/* @reaches setter-prop render-terminal */}
    </div>
  );
}

// A handler read from context: the call runs the provider's function.
type Store = { save: (text: string) => void };
const StoreContext = createContext<Store>();

function saveText(text: string) {
  console.log(text); // @reaches ctx-call
}

export function Provider(props: { children: unknown }) {
  return <StoreContext.Provider value={{ save: saveText }}>{props.children as never}</StoreContext.Provider>;
}

export function Saver(props: { text: string }) {
  const store = useContext(StoreContext)!;
  return <button onClick={() => store.save(props.text)}>save</button>; // @trace ctx-call forward props.text
}

// A callback whose return is void: nothing comes back to the call.
function each(items: string[], visit: (item: string) => void) {
  for (const item of items) visit(item);
}

export function logEach(names: string[]) { // @trace void-cb forward symbol names @outcome void-cb ok
  each(names, (name) => console.log(name)); // @reaches void-cb
}

// Backward from a handler's parameter: only the callers that hand it in
// (`Loud`, never `Chooser`, which hands `Picker` a setter).
function shout(text: string) { // @trace handler-back backward symbol text
  console.log(text);
}

export function Loud(props: { word: string }) { // @stop handler-back untraced parameter
  return <Picker label={props.word} onPick={shout} />;
}
