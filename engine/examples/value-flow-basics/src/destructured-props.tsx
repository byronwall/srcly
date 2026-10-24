// A component that destructures its props: `{ viewer }` is bound at the
// parameter, not read from a `props` object. A declaration anchor on Badge
// must find the read of `viewer` through the engine's own relations, not by
// matching `props.` in the source text.
export function Badge({ viewer }: { viewer: { name: string } }) {
  return <span>{viewer.name}</span>;
}
