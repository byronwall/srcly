// An angle-bracket assertion is the same object as `as`: a write through it changes the alias's object.
export function AngleAssertion() {
  const seed = { k: "OLD" }; // @produces we-angle none proven @caveat we-angle mutable
  const alias = seed;
  (<{ k: string }>alias).k = "NEW";
  return seed.k; // @trace we-angle backward seed.k
}
