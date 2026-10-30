// pick(a, b) returns b (T13). A forward walk from the first argument enters
// pick's parameter `a`, which nothing reads: it must not reach the slot,
// and it ends inside pick, never read, not at a false proof.
function pick(a: string, b: string) { // @reaches pick-first parameter "a" @never-reaches pick-first render-terminal
  return b;
}

export function Picks(props: { first: string; second: string }) {
  return <strong>{pick(props.first, props.second)}</strong>; // @trace pick-first forward props.first @outcome pick-first ok @never-reaches pick-first render-terminal
}
