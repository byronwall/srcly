// A callee with no body to enter is consumed by its call: a library method
// carries its receiver into the call's result, so `props.title` reaches the
// slot through `.trim()`, and `JSON.stringify(...)` begins at `JSON`, a
// global the program does not declare. A first-party method has a body: the
// walk does not pretend its receiver reaches the result through `this`, so
// `box` stops at a dead end at `box.read`.
class Box {
  constructor(private value: string) {}
  read() { // @visits box parameter "this"
    return this.value;
  }
}

export function Trimmed(props: { title: string; data: object }) { // @stop json untraced * "props"
  const box = new Box(props.title);
  return (
    <p>
      {/* @trace trimmed forward props.title @outcome trimmed assumed @reaches trimmed render-terminal */}
      <span>{props.title.trim()}</span>
      {/* JSON is where its value begins, never a stop; an argument stays at its own call. */}
      {/* @trace json backward JSON.stringify(props.data) @visits json value "JSON" */}
      <code>{JSON.stringify(props.data)}</code>
      {/* @trace box forward box @outcome box ok @reaches box render-terminal */}
      <b>{box.read()}</b>
    </p>
  );
}
