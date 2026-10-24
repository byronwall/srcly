// One helper, two calls (T13). Each call's result belongs to that call alone:
// a forward walk from `props.a` reaches the first slot through id(), never the
// second, and from `props.b` the second, never the first.
function id(value: string) {
  return value;
}

export function TwoCalls(props: { a: string; b: string }) {
  return (
    <div>
      <span>{id(props.a)}</span>
      <em>{id(props.b)}</em>
    </div>
  );
}
