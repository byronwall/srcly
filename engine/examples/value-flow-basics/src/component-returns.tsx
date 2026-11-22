// React is not installed here: the engine knows `cloneElement` by the module its import names.
import { cloneElement, type ReactElement } from "react";

// What a component returns is what the framework renders at its occurrence:
// `return props.text` renders the text, and `cloneElement(child, extra)` is a
// copy of the element that holds the props it is given. A returned JSX
// element renders each value in its own slot, so its return adds no end.
function Plain(props: { text: string }) {
  return props.text; // @reaches plain-return render-terminal
}
function Toned(props: { tone: string; children: ReactElement<{ className?: string }> }) {
  return cloneElement(props.children, { className: props.tone }); // @reaches clone-tone render-terminal
}
function Boxed(props: { title: string }) {
  return (
    <section>
      <h2>{props.title}</h2>{/* @reaches boxed-title render-terminal */}
    </section>
  );
}
export function Host(props: { text: string; tone: string; title: string }) {
  return (
    <div>
      <Plain text={props.text} />{/* @trace plain-return forward props.text @outcome plain-return ok @reaches plain-return component-occurrence */}
      <Toned tone={props.tone}><span>x</span></Toned>{/* @trace clone-tone forward props.tone @outcome clone-tone ok @reaches clone-tone component-occurrence @no-edge clone-tone * * external-call */}
      <Boxed title={props.title} />{/* @trace boxed-title forward props.title @outcome boxed-title ok @reaches boxed-title component-occurrence */}
    </div>
  );
}

// A function that is called, not rendered, hands its return to its call.
function shout(text: string) {
  return text.toUpperCase(); // @never-reaches called-return render-terminal
}
export function Caller(props: { word: string }) {
  return <p>{shout(props.word)}</p>; // @trace called-return forward props.word @outcome called-return ok @reaches called-return render-terminal
}
