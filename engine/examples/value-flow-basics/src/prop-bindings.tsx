// A caller's attribute binds the prop it names, however the component takes
// its props. A destructured binding (`{ title }`) receives it, and an
// optional prop binds like a required one wherever an occurrence passes it.
// A prop no occurrence passes (`note`, `tone`) is still unbound.
function Section({ title, item, note }: { title: string; item: { name: string }; note?: string }) {
  return (
    <div id={title.replace(" ", "-")}>
      {item.name}
      {note?.length}
    </div>
  );
}

function Hint(props: { hint?: string; tone?: string }) {
  return <small class={props.tone}>{props.hint}</small>;
}

export function Page() {
  const label = "Hello world";
  return (
    <>
      <Section title={label} item={{ name: "n" }} />
      <Hint hint="Try again" />
    </>
  );
}
