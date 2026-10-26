// An arrow function's expression body is its return: `props.a` enters
// `shout` and comes back out at its own call's slot. The two calls stay
// apart (T13): `props.a` never reaches `props.b`'s slot.
const shout = (value: string) => `${value}!`;

export function Shouts(props: { a: string; b: string }) {
  return (
    <div>
      <span>{shout(props.a)}</span>
      <em>{shout(props.b)}</em>
    </div>
  );
}
