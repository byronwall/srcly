// A read sees every assignment that can reach it: after the branch, `label`
// is `props.first` or `props.second`, so both reach the slot (each partial,
// one of the bindings that can reach it). In straight-line code the last
// assignment before a read is the one it sees: `props.stale` is overwritten
// before `value` is read, so it never reaches the slot.
export function Reassigned(props: { first: string; second: string; flag: boolean }) {
  let label = "none";
  if (props.flag) label = props.first; // @trace re-first forward props.first
  else label = props.second; // @trace re-second forward props.second @outcome re-first,re-second ok @edge re-first,re-second references partial
  return <span>{label}</span>; // @reaches re-first,re-second render-terminal
}

export function Overwritten(props: { stale: string; fresh: string }) {
  let value = props.stale; // @trace stale forward props.stale @stop stale disconnected * "value"
  value = props.fresh; // @trace fresh forward props.fresh @outcome fresh ok @no-edge fresh * !proven
  return <b>{value}</b>; // @reaches fresh render-terminal
}
