import { createResource } from "solid-js";
import { unmodelledCount } from "unmodelled-package";

// A component whose two prop reads land differently: `title` comes from a
// resource (an origin), `count` from a call into external code, where its
// value begins. A declaration anchor on Pair reads `assumed`, never `ok`:
// `count`'s value is only assumed to be what a package with no model returns.
function Pair(props: { title: string; count: number }) { // @trace pair both symbol Pair @outcome pair assumed @edge pair prop-read
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
  return <Pair title={title() ?? ""} count={unmodelledCount()} />; // @reaches pair component-occurrence @stop pair framework-runtime resource-result @visits pair call @edge pair references * external-call
}
