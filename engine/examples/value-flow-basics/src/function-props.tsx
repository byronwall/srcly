// A function handed in as a prop or an argument is called where it is read
// (`props.onSave(v)`, `run(v)`): the argument binds the parameter of each
// function a caller hands in, paired by call site, so two callers that hand
// in different handlers never cross.
function saveDraft(text: string) {
  console.log(text); // @reaches draft
}

function saveFinal(text: string) {
  console.error(text); // @reaches final
}

export function Editor(props: { text: string; onSave: (text: string) => void }) {
  return <button onClick={() => props.onSave(props.text)}>save</button>;
}

export function Drafts(props: { draft: string }) {
  return <Editor text={props.draft} onSave={saveDraft} />; // @trace draft forward props.draft @reaches draft component-occurrence
}

export function Finals(props: { final: string }) {
  return <Editor text={props.final} onSave={(text) => saveFinal(text)} />; // @trace final forward props.final @reaches final component-occurrence
}

function each(items: string[], visit: (item: string) => void) {
  for (const item of items) visit(item);
}

export function logAll(names: string[]) { // @trace names forward symbol names
  each(names, (name) => {
    console.log(name); // @reaches names
  });
}
