import { createResource } from "solid-js";

// A component whose two prop reads do not both land: `title` comes from a
// resource (an origin), `count` from a call into external code. A
// declaration anchor on Pair must read `partial`, never `ok`, because one of
// its prop walks stops.
function Pair(props: { title: string; count: number }) { // @trace pair both symbol Pair @outcome pair partial @edge pair prop-read
  return (
    <p>
      {/* @visits pair field-read "title" */}
      {props.title}
      {/* @stop pair unbound-read field-read "count" @visits pair field-read "count" */}
      {props.count}
    </p>
  );
}

export function HalfLanded() {
  const [title] = createResource(async () => "x"); // @reaches pair resource-input
  return <Pair title={title() ?? ""} count={Math.random()} />; // @reaches pair component-occurrence @stop pair framework-runtime resource-result
}
