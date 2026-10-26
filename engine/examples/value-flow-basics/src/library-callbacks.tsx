// Functions written as arguments. To a library call (`reduce`, `sort`) the
// function is called by that call alone: a parameter whose type accepts the
// receiver's element receives it, and the function's return reaches the
// call's value, both assumed. `sum` is a number, not an item, so it receives
// nothing from `props.items`. To a first-party function (`applyTo`) the
// callback is called from inside that body, where pairing works as before.
export function Ranked(props: { items: { n: number }[] }) {
  const total = props.items.reduce((sum, item) => sum + item.n, 0);
  return <p>{total}</p>;
}

function applyTo(value: number, fn: (x: number) => number) {
  return fn(value);
}

export function Doubled(props: { n: number }) {
  const doubled = applyTo(props.n, (x) => x * 2);
  return <b>{doubled}</b>;
}
