// A first-party method that reads `this` takes the call's receiver as its
// receiver: `first` reaches the slot through `read()`'s `this.label`. The
// receiver is bound like an argument and paired the same way (T13): `first`
// comes back out at its own call, never at `second.read()`.
const counter = { // @never-reaches second-back
  label: "count",
  read() {
    return this.label;
  },
};

export function Receivers(props: { other: typeof counter }) { // @stop second-back untraced parameter
  const first = counter; // @never-reaches second-back
  const second = props.other; // @visits second-back field-read "other"
  return (
    <p>
      {/* @trace this-first forward first @outcome this-first ok @reaches this-first render-terminal */}
      <span>{first.read()}</span>
      {/* @trace second-back backward second.read() */}
      <em>{second.read()}</em>
    </p>
  );
}
