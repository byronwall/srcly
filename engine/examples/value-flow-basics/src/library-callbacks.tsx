// Functions written as arguments. To a library call (`reduce`, `sort`) the
// function is called by that call alone: a parameter whose type accepts the
// receiver's element receives it, and the function's return reaches the
// call's value. For the standard library both are modelled. `sum` is a number, not an item, so it receives
// nothing from `props.items`. To a first-party function (`applyTo`) the
// callback is called from inside that body, where pairing works as before.
export function Ranked(props: { items: { n: number }[] }) {
  const total = props.items.reduce((sum, item) => sum + item.n, 0); // @trace reduce forward props.items @outcome reduce ok @edge reduce callback-parameter proven standard-library @edge reduce return-value proven standard-library @visits reduce parameter "item" @never-reaches reduce parameter "sum"
  return <p>{total}</p>; // @reaches reduce * "total"
}

function applyTo(value: number, fn: (x: number) => number) {
  return fn(value);
}

export function Doubled(props: { n: number }) {
  const doubled = applyTo(props.n, (x) => x * 2); // @trace doubled forward props.n @no-edge doubled callback-parameter * @no-edge doubled argument-binding !proven @edge doubled argument-binding proven @never-reaches doubled * "x"
  return <b>{doubled}</b>; // @reaches doubled render-terminal
}
