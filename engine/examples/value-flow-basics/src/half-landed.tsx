import { createResource } from "solid-js";

// A component whose two prop reads do not both land: `title` comes from a
// resource (an origin), `count` from a call into external code. A
// declaration anchor on Pair must read `partial`, never `ok`, because one of
// its prop walks stops.
function Pair(props: { title: string; count: number }) {
  return (
    <p>
      {props.title}
      {props.count}
    </p>
  );
}

export function HalfLanded() {
  const [title] = createResource(async () => "x");
  return <Pair title={title() ?? ""} count={Math.random()} />;
}
