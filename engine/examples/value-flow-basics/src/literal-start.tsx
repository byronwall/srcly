// A value that starts at a literal: `const label = "x"` rendered. Walking
// backward from the render slot ends at the literal, which is where the value
// naturally begins, so there is no frontier.
export function LiteralStart() {
  const label = "x"; // @visits literal-back * ""x""
  return <span>{label}</span>; // @trace literal-back backward label @outcome literal-back ok
}

// An empty `{}` or `[]` begins a value, as a literal does: a backward trace that reaches one has landed.
export function emptyStart(keys: string[]) {
  const seen: Record<string, boolean> = {};
  for (const key of keys) seen[key] = true;
  return seen; // @trace empty-object backward seen @outcome empty-object ok
}
