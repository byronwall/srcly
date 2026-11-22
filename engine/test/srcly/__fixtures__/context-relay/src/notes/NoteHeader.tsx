export function NoteHeader(props: { name: string; count: number; owner: string }) {
  return <h1>{props.name} {props.count} {props.owner}</h1>;
}
