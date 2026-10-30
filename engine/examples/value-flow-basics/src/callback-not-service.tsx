// A component's `save` prop is a callback its caller hands in, not a
// database client's write: a call through it is never named a database write.
export function Editor(props: { draft: string; save: (text: string) => void }) {
  return <button onClick={() => props.save(props.draft)}>save</button>; // @trace draft-save forward props.draft @never-reaches draft-save external-effect @stop draft-save disconnected call
}
