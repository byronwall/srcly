import { createStore } from "solid-js/store";

// Field producers: backward from a field read, the anchor graph names the
// expression that fills that field where its object is built (`producers`),
// and how the value gets to the read. A store's first value is an
// initialization, kept apart from a later write. A whole object carried past
// a pack is never proof of one of its fields.
type Note = { id: string; title: string; tags: string[] };

// A returned object literal's field reaches the read out of the call.
function loadNote(key: string): Note {
  return { id: key, title: "LOADED_TITLE", tags: ["loaded-tag"] }; // @produces fpr-returned return proven
}
export function ReturnedTitle() {
  const note = loadNote("KEY");
  return <h1>{note.title}</h1>; // @trace fpr-returned backward note.title @outcome fpr-returned ok
}

// A signature-only call: nothing in the source returns into it, so its field has no producer.
declare function externalNote(key: string): Note;
export function OpaqueTitle() {
  const note = externalNote("KEY");
  return <h1>{note.title}</h1>; // @trace fpr-opaque backward note.title @no-produces fpr-opaque
}

// The same initial string from two fields: the title field in one, the joined tags in the other.
export function TitleDraft(props: { note: Note }) {
  const [draft, setDraft] = createStore({ title: props.note.title }); // @produces fpr-title initialization proven "title" @edge fpr-title references partial state-initialization
  // @trace fpr-title backward draft.title @produces fpr-title write partial "value" @reaches fpr-title parameter
  return <input value={draft.title} onInput={(event) => setDraft("title", event.currentTarget.value)} />;
}
export function TagsDraft(props: { note: Note }) {
  const [draft, setDraft] = createStore({ title: props.note.tags.join(" / ") }); // @produces fpr-tags initialization proven
  // @trace fpr-tags backward draft.title @produces fpr-tags write partial "value" @reaches fpr-tags parameter
  return <input value={draft.title} onInput={(event) => setDraft("title", event.currentTarget.value)} />;
}

// One component, two callers: the producer is in the component; which value it reads depends on the call site.
export function SharedDraft(props: { note: Note }) {
  const [draft] = createStore({ title: props.note.title }); // @produces fpr-shared initialization proven "title"
  return <p>{draft.title}</p>; // @trace fpr-shared backward draft.title
}
const alpha: Note = { id: "A", title: "ALPHA_TITLE", tags: ["alpha-tag"] };
const beta: Note = { id: "B", title: "BETA_TITLE", tags: ["beta-tag"] };
export function TwoCallers() {
  return (
    <main>
      <SharedDraft note={alpha} />
      <SharedDraft note={beta} />
    </main>
  );
}

// A whole object handed on is not a field's producer: `summary.owner` reads a field the pack fills, `card.title` a field of an object made elsewhere.
export function Summary(props: { owner: string; card: Note }) { // @stop fpr-card untraced parameter
  const summary = { owner: props.owner ?? "Unknown", card: props.card }; // @produces fpr-owner none proven
  return <p>{summary.owner} {summary.card.title}</p>; // @trace fpr-owner backward summary.owner @trace fpr-card backward summary.card.title @no-produces fpr-card
}
