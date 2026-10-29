import { useParams } from "@solidjs/router";
import { createResource, Match, Show, Switch } from "solid-js";
import { NoteView } from "../../components/NoteView";
import { fetchNote } from "../../server/notes";

export default function NotePage() {
  const params = useParams();
  const [note] = createResource(() => params.id, (id) => fetchNote(id));
  return (
    <Switch>
      <Match when={note.error}>
        <p>Could not load the note: {String(note.error)}</p>
      </Match>
      <Match when={note()}>
        {(n) => (
          <article>
            <h1>{n().title}</h1>
            <NoteView note={n()} />
            <Show when={n().sourceId}>
              <p>Source {n().sourceId}</p>
            </Show>
          </article>
        )}
      </Match>
    </Switch>
  );
}
