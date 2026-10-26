// A first-party method that reads `this` takes the call's receiver as its
// receiver: `first` reaches the slot through `read()`'s `this.label`. The
// receiver is bound like an argument and paired the same way (T13): `first`
// comes back out at its own call, never at `second.read()`.
const counter = {
  label: "count",
  read() {
    return this.label;
  },
};

export function Receivers(props: { other: typeof counter }) {
  const first = counter;
  const second = props.other;
  return (
    <p>
      <span>{first.read()}</span>
      <em>{second.read()}</em>
    </p>
  );
}
