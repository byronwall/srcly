// Two dead ends: a value assigned to a local that nothing reads, and a value
// handed to an untyped callback the engine cannot follow. Each forward walk
// stops with nothing continuing, so the anchor graph draws a dead-end
// frontier instead of ending the path quietly.
export function DeadEnd(props: { label: string; onPick: (value: string) => void }) {
  const unused = props.label;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callback: any = props.onPick;
  callback(props.label);
  return <span>{props.label.length}</span>;
}
