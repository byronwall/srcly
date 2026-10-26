// A value that starts at a literal: `const label = "x"` rendered. Walking
// backward from the render slot ends at the literal, which is where the value
// naturally begins, so there is no frontier.
export function LiteralStart() {
  const label = "x"; // @visits literal-back * ""x""
  return <span>{label}</span>; // @trace literal-back backward label @outcome literal-back ok
}
