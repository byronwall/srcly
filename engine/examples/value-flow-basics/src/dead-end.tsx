// A value assigned to a local that nothing reads ends there, never read: the
// checker proves it goes nowhere, and the box says so. A value handed to an
// untyped callback the engine cannot follow is a dead end: the walk stops
// with nothing continuing, so the anchor graph draws a dead-end frontier
// instead of ending the path quietly.
export function DeadEnd(props: { label: string; onPick: (value: string) => void }) {
  const unused = props.label; // @trace unused forward props.label @outcome unused ok @reaches unused alias "unused"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callback: any = props.onPick; // @trace callback forward props.onPick @outcome callback partial
  callback(props.label); // @stop callback disconnected call
  return <span>{props.label.length}</span>;
}
