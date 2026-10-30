// A component's `save` prop is a callback its caller hands in, not a
// database client's write: a call through it is never named a database write.
// Nothing in the program renders `Editor`, so the call hands the draft to
// whoever does: it ends at the module's API.
export function Editor(props: { draft: string; save: (text: string) => void }) {
  return <button onClick={() => props.save(props.draft)}>save</button>; // @trace draft-save forward props.draft @never-reaches draft-save external-effect @reaches draft-save call @outcome draft-save assumed
}

// An export's parameter that is a list is not a callback: its library
// method (`forEach`) is not where the module hands a value to its caller.
export function each(names: string[], visit: (name: string) => void) { // @trace api-callback forward symbol visit
  names.forEach((name) => visit(name)); // @never-reaches api-callback call "names.forEach((name) => visit(name))" @reaches api-callback call "visit(name)"
}
