// React is not installed here: the engine knows `memo` by the module its import names.
import { memo } from "react";

// A spread into a component hands its value to the component's props: its
// reads see what the spread passed. A component wrapped by `memo` is still
// that component, so its props bind the same way.
function Label(props: { text: string }) {
  return <b>{props.text}</b>; // @reaches spread,memo render-terminal
}

function Tag({ text }: { text: string }) {
  return <i>{text}</i>; // @reaches spread-destructured render-terminal
}

const Fast = memo(Label);

export function Spread(props: { text: string }) {
  return <Label {...props} />; // @trace spread forward props @outcome spread ok @reaches spread component-occurrence
}

export function SpreadDestructured(props: { text: string }) {
  return <Tag {...props} />; // @trace spread-destructured forward props @outcome spread-destructured ok @reaches spread-destructured component-occurrence
}

export function Memoised(props: { text: string }) {
  return <Fast text={props.text} />; // @trace memo forward props.text @outcome memo ok @reaches memo component-occurrence
}
