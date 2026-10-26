// A caller's attribute binds the prop it names, however the component takes
// its props. A destructured binding (`{ title }`) receives it, and an
// optional prop binds like a required one wherever an occurrence passes it.
// A prop no occurrence passes (`note`, `tone`) is still unbound.
function Section({ title, item, note }: { title: string; item: { name: string }; note?: string }) { // @trace section backward symbol Section @outcome section partial
  return (
    <div id={title.replace(" ", "-")}>
      {item.name}
      {/* @stop section unbound-read * "length" */}
      {note?.length}
    </div>
  );
}

function Hint(props: { hint?: string; tone?: string }) { // @trace hint backward symbol Hint
  return <small class={props.tone}>{props.hint}</small>; // @stop hint unbound-read * "tone"
}

export function Page() {
  const label = "Hello world"; // @visits section literal
  return (
    <>
      <Section title={label} item={{ name: "n" }} />
      {/* @visits hint literal */}
      <Hint hint="Try again" />
    </>
  );
}
