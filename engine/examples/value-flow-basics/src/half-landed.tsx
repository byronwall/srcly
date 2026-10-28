import { createResource } from "solid-js";

// A component whose two prop reads land differently: `title` comes from a
// resource (an origin), `count` from a call into external code, where its
// value begins. A declaration anchor on Pair reads `partial`, never `ok`:
// `count`'s value is only assumed to be what `Math.random` returns.
function Pair(props: { title: string; count: number }) { // @trace pair both symbol Pair @outcome pair partial @edge pair prop-read
  return (
    <p>
      {/* @visits pair field-read "title" */}
      {props.title}
      {/* @visits pair field-read "count" */}
      {props.count}
    </p>
  );
}

export function HalfLanded() {
  const [title] = createResource(async () => "x"); // @reaches pair resource-input
  return <Pair title={title() ?? ""} count={Math.random()} />; // @reaches pair component-occurrence @stop pair framework-runtime resource-result @visits pair call @edge pair references * standard-library
}
