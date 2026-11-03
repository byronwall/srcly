// Functions written as arguments. To a library call (`reduce`, `sort`) the
// function is called by that call alone. A standard method's row says what
// each parameter takes: `item` the receiver's element, `sum` the seed and then
// what the function returned before, so it sees `props.items` only through
// `sum + item.n`. To a first-party function (`applyTo`) the
// callback is called from inside that body: `fn(value)` binds its `x`.
export function Ranked(props: { items: { n: number }[] }) {
  const total = props.items.reduce((sum, item) => sum + item.n, 0); // @trace reduce forward props.items @outcome reduce ok @edge reduce callback-parameter proven standard-library @edge reduce return-value proven standard-library @visits reduce parameter "item" @visits reduce parameter "sum" @path reduce "sum + item.n" "sum"
  return <p>{total}</p>; // @reaches reduce * "total"
}

function applyTo(value: number, fn: (x: number) => number) {
  return fn(value);
}

export function Doubled(props: { n: number }) {
  const doubled = applyTo(props.n, (x) => x * 2); // @trace doubled forward props.n @no-edge doubled callback-parameter * @no-edge doubled argument-binding !proven @edge doubled argument-binding proven @visits doubled parameter "x"
  return <b>{doubled}</b>; // @reaches doubled render-terminal
}
