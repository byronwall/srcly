// A value the code ends in place is not a dead end: `props.mode` only
// decides an `if`, and `state.label` is written, not read. A value written
// into another object's field is carried somewhere the engine does not
// follow: `props.note` stays a dead end.
export function Modes(props: { mode: string; note: string }) {
  const state = { label: "", note: "" };
  if (props.mode === "dark") state.label = "dark"; // @trace mode forward props.mode @outcome mode ok @reaches mode derived
  state.note = props.note; // @trace note forward props.note @outcome note partial @stop note disconnected field-read
  return <span>{state.label}</span>;
}
