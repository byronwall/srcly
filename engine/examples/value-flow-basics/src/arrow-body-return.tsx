// An arrow function's expression body is its return: `props.a` enters
// `shout` and comes back out at its own call's slot. The two calls stay
// apart (T13): `props.a` never reaches `props.b`'s slot.
const shout = (value: string) => `${value}!`; // @visits shout-a return

export function Shouts(props: { a: string; b: string }) {
  return (
    <div>
      {/* @trace shout-a forward props.a @outcome shout-a ok @reaches shout-a */}
      <span>{shout(props.a)}</span>
      {/* @trace shout-b forward props.b @reaches shout-b */}
      <em>{shout(props.b)}</em>
    </div>
  );
}
