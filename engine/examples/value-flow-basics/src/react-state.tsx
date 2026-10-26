// React is not installed here: the engine recognises the state factory by the module its import names.
import { useState } from "react";

// React's state pair: what goes into the setter is what later reads of the
// state see, and the initial value seeds it.
export function Clicked(props: { initial: string; picked: string }) {
  const [label, setLabel] = useState(props.initial); // @trace initial forward props.initial @reaches initial external-effect
  const pick = () => setLabel(props.picked); // @trace picked forward props.picked
  // @outcome initial,picked ok @edge initial,picked * partial framework-state @no-edge initial,picked * * external-call
  return <button onClick={pick}>{label}</button>; // @reaches initial,picked render-terminal
}
