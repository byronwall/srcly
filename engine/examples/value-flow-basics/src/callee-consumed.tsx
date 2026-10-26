// A callee with no body to enter is consumed by its call: a library method
// carries its receiver into the call's result, so `props.title` reaches the
// slot through `.trim()`, and `JSON.stringify(...)` begins at `JSON`, a
// global the program does not declare. A first-party method has a body: the
// walk does not pretend its receiver reaches the result through `this`, so
// `box` stops at a dead end at `box.read`.
class Box {
  constructor(private value: string) {}
  read() {
    return this.value;
  }
}

export function Trimmed(props: { title: string; data: object }) {
  const box = new Box(props.title);
  return (
    <p>
      <span>{props.title.trim()}</span>
      <code>{JSON.stringify(props.data)}</code>
      <b>{box.read()}</b>
    </p>
  );
}
