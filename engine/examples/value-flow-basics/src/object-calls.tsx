// Functions reached through an object. A factory returns its closures as a
// shorthand property (`format`), a property's arrow (`shout`) and a nested
// object's (`actions.quote`); callers reach them through the object, a
// destructured binding and an alias. The checker names each one's function,
// so each call is paired with it like a direct call.
function makeLabeler(prefix: string) {
  const format = (value: string) => `${prefix}${value}`;
  return {
    format,
    shout: (value: string) => format(value).length,
    actions: { quote: (value: string) => `"${value}"` },
  };
}

const labeler = makeLabeler("> ");

export function Labeled(props: { name: string; title: string; note: string; tag: string }) {
  const { format } = labeler;
  const shout = labeler.shout;
  return (
    <p>
      {/* @trace object-format forward props.name @outcome object-format ok @reaches object-format render-terminal @edge object-format argument-binding proven */}
      <span>{labeler.format(props.name)}</span>
      {/* @trace object-binding forward props.title @outcome object-binding ok @reaches object-binding render-terminal @edge object-binding argument-binding proven */}
      <b>{format(props.title)}</b>
      {/* @trace object-nested forward props.note @outcome object-nested ok @reaches object-nested render-terminal @edge object-nested argument-binding proven */}
      <i>{labeler.actions.quote(props.note)}</i>
      {/* @trace object-alias forward props.tag @outcome object-alias ok @reaches object-alias render-terminal @edge object-alias argument-binding proven */}
      <u>{shout(props.tag)}</u>
    </p>
  );
}

// Two objects from one factory hold their own state: what `first.set`
// stores is never read back through `second.get`: `get` has two callers,
// so the held value ends at its return.
function makeSlot() {
  let held = "";
  return { set: (value: string) => { held = value; }, get: () => held }; // @reaches slot return
}

const first = makeSlot();
const second = makeSlot();

export function Slots(props: { a: string }) {
  first.set(props.a); // @trace slot forward props.a @edge slot argument-binding proven
  return (
    <p>
      <span>{first.get()}</span>
      <em>{second.get()}</em> {/* @never-reaches slot */}
    </p>
  );
}

// A property whose type is a union of two functions names no one function:
// the call is a named frontier, never paired with either.
const either = Math.random() > 0.5 ? { pick: (value: string) => value } : { pick: (value: string) => [value] };

export function Picked(props: { x: string }) {
  return <s>{either.pick(props.x)}</s>; // @trace union forward props.x @outcome union partial @reaches union render-terminal @stop union dynamic-dispatch @no-edge union argument-binding *
}
