import { createResource } from "solid-js";

// A resource calls its fetcher with its source's value, so what the source
// returns is what the fetcher's parameter receives.
async function loadNote(id: string) {
  return { id, title: `note ${id}` }; // @visits note-source return
}

export function Note(props: { id: string }) {
  const [note] = createResource(() => props.id, (id) => loadNote(id)); // @trace note-source forward props.id @visits note-source parameter "id" @stop note-source framework-runtime resource-input
  return <h1>{note()?.title}</h1>; // @reaches note-source render-terminal @stop note-source framework-runtime resource-result
}
