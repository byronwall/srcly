// React is not installed here: the engine recognises the state factory by the module its import names.
import { useState } from "react";

// React's state pair: what goes into the setter is what later reads of the
// state see, and the initial value seeds it.
export function Clicked(props: { initial: string; picked: string }) {
  const [label, setLabel] = useState(props.initial);
  const pick = () => setLabel(props.picked);
  return <button onClick={pick}>{label}</button>;
}
