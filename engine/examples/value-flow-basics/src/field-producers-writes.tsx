// Every way the code can write an object after it is built. One row per
// spelling: the object literal is the field's producer, and a later write
// must leave it a candidate with a `mutable` caveat, never a sure answer.
// A new write spelling the engine learns gets a row here. The last row is
// the control: a plain read is no write.
type Note = { title: string };
type Counter = { count: number };
declare function rename(note: Note): void;
declare const flag: boolean;
declare const other: Note;

export function WAssign() {
  const note = { title: "OLD" }; // @produces fw-assign none proven @caveat fw-assign mutable
  note.title = "NEW"; // @produces fw-assign none proven @caveat fw-assign mutable
  return <p>{note.title}</p>; // @trace fw-assign backward note.title
}

export function WElement() {
  const note = { title: "OLD" }; // @produces fw-element none proven @caveat fw-element mutable
  note["title"] = "NEW"; // @produces fw-element none proven @caveat fw-element mutable
  return <p>{note.title}</p>; // @trace fw-element backward note.title
}

export function WCompound() {
  const counter = { count: 0 }; // @produces fw-compound none proven @caveat fw-compound mutable
  counter.count += 1; // the walk stops at the operand 1: the stored value is 0 + 1
  return <p>{counter.count}</p>; // @trace fw-compound backward counter.count @produces-open fw-compound
}

export function WLogical() {
  const note = { title: "" }; // @produces fw-logical none proven @caveat fw-logical mutable
  note.title ||= "NEW"; // @produces fw-logical none proven @caveat fw-logical mutable
  return <p>{note.title}</p>; // @trace fw-logical backward note.title
}

export function WNullish() {
  const note: { title?: string } = { title: undefined }; // @produces fw-nullish none proven @caveat fw-nullish mutable
  note.title ??= "NEW"; // @produces fw-nullish none proven @caveat fw-nullish mutable
  return <p>{note.title}</p>; // @trace fw-nullish backward note.title
}

export function WIncrement() {
  const counter: Counter = { count: 0 }; // @produces fw-increment none proven @caveat fw-increment mutable
  counter.count++;
  return <p>{counter.count}</p>; // @trace fw-increment backward counter.count
}

export function WDelete() {
  const note: { title?: string } = { title: "OLD" }; // @produces fw-delete none proven @caveat fw-delete mutable
  delete note.title;
  return <p>{note.title}</p>; // @trace fw-delete backward note.title
}

export function WArrayPattern() {
  const note = { title: "OLD" }; // @produces fw-array-pattern none proven @caveat fw-array-pattern mutable
  [note.title] = ["NEW"];
  return <p>{note.title}</p>; // @trace fw-array-pattern backward note.title
}

export function WObjectPattern() {
  const note = { title: "OLD" }; // @produces fw-object-pattern none proven @caveat fw-object-pattern mutable
  ({ title: note.title } = { title: "NEW" });
  return <p>{note.title}</p>; // @trace fw-object-pattern backward note.title
}

export function WForOf() {
  const note = { title: "OLD" }; // @produces fw-for-of none proven @caveat fw-for-of mutable
  for (note.title of ["NEW"]);
  return <p>{note.title}</p>; // @trace fw-for-of backward note.title
}

export function WCast() {
  const note = { title: "OLD" }; // @produces fw-cast none proven @caveat fw-cast mutable
  (note as Note).title = "NEW";
  return <p>{note.title}</p>; // @trace fw-cast backward note.title
}

export function WNonNull() {
  const note = { title: "OLD" }; // @produces fw-non-null none proven @caveat fw-non-null mutable
  note!.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-non-null backward note.title
}

export function WDefineProperty() {
  const note = { title: "OLD" }; // @produces fw-define none proven @caveat fw-define mutable
  Object.defineProperty(note, "title", { value: "NEW" });
  return <p>{note.title}</p>; // @trace fw-define backward note.title
}

export function WReflect() {
  const note = { title: "OLD" }; // @produces fw-reflect none proven @caveat fw-reflect mutable
  Reflect.set(note, "title", "NEW");
  return <p>{note.title}</p>; // @trace fw-reflect backward note.title
}

export function WCallArgument() {
  const note = { title: "OLD" }; // @produces fw-call-arg none proven @caveat fw-call-arg mutable
  rename(note);
  return <p>{note.title}</p>; // @trace fw-call-arg backward note.title
}

export function WAlias() {
  const note = { title: "OLD" }; // @produces fw-alias none proven @caveat fw-alias mutable
  const alias = note;
  alias.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-alias backward note.title
}

export function WMemberAlias() {
  const doc = { note: { title: "OLD" } }; // @produces fw-member-alias none proven @caveat fw-member-alias mutable
  const sub = doc.note;
  sub.title = "NEW";
  return <p>{doc.note.title}</p>; // @trace fw-member-alias backward doc.note.title
}

export function WDestructuredAlias() {
  const doc = { note: { title: "OLD" } }; // @produces fw-destructured-alias none proven @caveat fw-destructured-alias mutable
  const { note: inner } = doc;
  inner.title = "NEW";
  return <p>{doc.note.title}</p>; // @trace fw-destructured-alias backward doc.note.title
}

export function WClosure() {
  const note = { title: "OLD" }; // @produces fw-closure none proven @caveat fw-closure mutable
  const update = () => {
    note.title = "NEW"; // @produces fw-closure none proven @caveat fw-closure mutable
  };
  update();
  return <p>{note.title}</p>; // @trace fw-closure backward note.title
}

export function WArrayContainer() {
  const note = { title: "OLD" }; // @produces fw-array-container none proven @caveat fw-array-container mutable
  const list = [note];
  list[0].title = "NEW";
  return <p>{note.title}</p>; // @trace fw-array-container backward note.title
}

export function WObjectContainer() {
  const note = { title: "OLD" }; // @produces fw-object-container none proven @caveat fw-object-container mutable
  const box = { note };
  box.note.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-object-container backward note.title
}

export function WConditional() {
  const note = { title: "OLD" }; // @produces fw-conditional none proven @caveat fw-conditional mutable
  (flag ? note : other).title = "NEW";
  return <p>{note.title}</p>; // @trace fw-conditional backward note.title
}

export function WReceiverMethod() {
  const note = { tags: ["OLD"] }; // @produces fw-receiver none proven @caveat fw-receiver mutable
  note.tags.push("NEW"); // @produces fw-receiver none proven @caveat fw-receiver mutable @caveat fw-receiver write
  return <p>{note.tags}</p>; // @trace fw-receiver backward note.tags
}

export function WParameterDefault() {
  const note = { title: "OLD" }; // @produces fw-param-default none proven @caveat fw-param-default mutable
  const touch = (target = note) => {
    target.title = "NEW";
  };
  touch();
  return <p>{note.title}</p>; // @trace fw-param-default backward note.title
}

export function WYield() {
  const note = { title: "OLD" }; // @produces fw-yield none proven @caveat fw-yield mutable
  function* items() {
    yield note;
  }
  for (const item of items()) item.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-yield backward note.title
}

export function WClassField() {
  const note = { title: "OLD" }; // @produces fw-class-field none proven @caveat fw-class-field mutable
  class Holder {
    held = note;
  }
  new Holder().held.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-class-field backward note.title
}

export async function WAwait() {
  const note = { title: "OLD" }; // @produces fw-await none proven @caveat fw-await mutable
  const same = await note;
  same.title = "NEW";
  return <p>{note.title}</p>; // @trace fw-await backward note.title
}

function tag(_parts: TemplateStringsArray, target: Note) {
  target.title = "NEW";
  return target.title;
}
export function WTaggedTemplate() {
  const note = { title: "OLD" }; // @produces fw-tagged none proven @caveat fw-tagged mutable
  const tagged = tag`${note}`;
  return <p title={tagged}>{note.title}</p>; // @trace fw-tagged backward note.title
}

function NoteEditor(props: { note: Note }) {
  props.note.title = "NEW";
  return <i>{props.note.title}</i>;
}
export function WJsxSpread() {
  const doc = { note: { title: "OLD" } }; // @produces fw-jsx-spread none proven @caveat fw-jsx-spread mutable
  return <p><NoteEditor {...doc} />{doc.note.title}</p>; // @trace fw-jsx-spread backward doc.note.title
}

declare function step(): Promise<number>;
export async function WCompoundAwait() {
  const counter = { count: 10 }; // @produces fw-compound-await none proven @caveat fw-compound-await mutable
  counter["count"] += await step(); // the walk stops at the operand: the stored value is 10 + the step
  return <p>{counter.count}</p>; // @trace fw-compound-await backward counter.count @produces-open fw-compound-await
}

const ui = { editor: NoteEditor };
export function WJsxMemberSpread() {
  const doc = { note: { title: "OLD" } }; // @produces fw-jsx-member-spread none proven @caveat fw-jsx-member-spread mutable
  return <p><ui.editor {...doc} />{doc.note.title}</p>; // @trace fw-jsx-member-spread backward doc.note.title
}

// Controls: a read that writes nothing keeps a sure answer.
export async function WAwaitMemberRead() {
  const state = { count: 10, done: Promise.resolve({ ready: true }) }; // @produces fw-await-member none proven @no-caveat fw-await-member
  const { ready } = await state.done;
  return <p title={String(ready)}>{state.count}</p>; // @trace fw-await-member backward state.count
}

export function WReadOnly() {
  const note = { title: "OLD" }; // @produces fw-read-only none proven @no-caveat fw-read-only
  console.log(note.title);
  return <p>{note.title}</p>; // @trace fw-read-only backward note.title
}
