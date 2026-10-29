import { createMemo, For } from "solid-js";
import { createStore } from "solid-js/store";
import { formatTags, type NoteDetail } from "../lib/notes";
import { saveTitle } from "../server/notes";

export function NoteView(props: { note: NoteDetail }) {
  const [draft, setDraft] = createStore({ title: props.note.title });
  const label = createMemo(() => formatTags(props.note.tags));
  const save = async () => {
    await saveTitle(props.note.id, draft.title);
  };
  return (
    <section>
      <input value={draft.title} onInput={(event) => setDraft("title", event.currentTarget.value)} />
      <p>{label()}</p>
      <ul>
        <For each={props.note.tags}>{(tag) => <li>{tag}</li>}</For>
      </ul>
      <button onClick={save}>Save</button>
    </section>
  );
}
