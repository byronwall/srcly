// pick(a, b) returns b (T13). A forward walk from the first argument enters
// pick's parameter `a`, which nothing returns: it must not reach the slot,
// and it ends at a dead end inside pick, not at a false proof.
function pick(a: string, b: string) {
  return b;
}

export function Picks(props: { first: string; second: string }) {
  return <strong>{pick(props.first, props.second)}</strong>;
}
