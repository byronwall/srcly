// A read sees every assignment that can reach it: after the branch, `label`
// is `props.first` or `props.second`, so both reach the slot (each partial,
// one of the bindings that can reach it). In straight-line code the last
// assignment before a read is the one it sees: `props.stale` is overwritten
// before `value` is read, so it never reaches the slot.
export function Reassigned(props: { first: string; second: string; flag: boolean }) {
  let label = "none";
  if (props.flag) label = props.first;
  else label = props.second;
  return <span>{label}</span>;
}

export function Overwritten(props: { stale: string; fresh: string }) {
  let value = props.stale;
  value = props.fresh;
  return <b>{value}</b>;
}
