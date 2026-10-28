// A value the code ends in place is not a dead end: `props.mode` only
// decides an `if`, and `state.label` is written, not read. A value written
// into another object's field is packed there: `state.note` is never read,
// so `props.note` ends at the write.
export function Modes(props: { mode: string; note: string }) {
  const state = { label: "", note: "" };
  if (props.mode === "dark") state.label = "dark"; // @trace mode forward props.mode @outcome mode ok @reaches mode derived
  state.note = props.note; // @trace note forward props.note @outcome note ok @reaches note field-read
  return <span>{state.label}</span>;
}
