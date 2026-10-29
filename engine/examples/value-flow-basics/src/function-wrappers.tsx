// The router is not installed here: the engine knows a wrapper by the module its import names.
import { action, query, useAction } from "@solidjs/router";

// A library call that returns the function it is given (SolidStart's server
// `query` and `action`, `useAction` over an action) runs that function when
// its result is called: the argument binds the wrapped function's parameter.
const loadNote = query(async (id: string) => {
  "use server";
  return { id, title: `note ${id}` }; // @visits note-id return
}, "note");

const saveTitle = action(async (title: string) => {
  "use server";
  console.log(title); // @reaches saved
}, "save-title");

export async function logNote(id: string) { // @trace note-id forward symbol id
  console.log(await loadNote(id)); // @reaches note-id
}

export function Note(props: { title: string }) {
  const save = useAction(saveTitle);
  return <button onClick={() => save(props.title)}>save</button>; // @trace saved forward props.title
}
