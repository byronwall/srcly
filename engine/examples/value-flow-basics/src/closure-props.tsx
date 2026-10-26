// A component whose props are read inside closures, rendered from another
// file. Each closure read binds to the caller's value; reads that only look
// like `props.tone` do not.
export function Chip(props: { tone: string; count: number; note?: string }) { // @trace chip backward symbol Chip @outcome chip partial
  const toneOf = () => props.tone;
  function countText() {
    return `${props.count}`;
  }
  // A shadowed `props` is this arrow's own parameter, never Chip's.
  const shadow = (props: { tone: string }) => props.tone;
  // The same field name on another object.
  const other = { tone: "cold" };
  const otherTone = () => other.tone;
  return (
    <span title={toneOf()} onClick={() => props.note}> {/* @stop chip unbound-read * "note" @edge chip gap */}
      {countText()}
      {shadow({ tone: "x" })}
      {otherTone()}
    </span>
  );
}
