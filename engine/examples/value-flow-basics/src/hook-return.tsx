// A component that reads a hook's result. Backward from the render slot,
// the hook's `return` is where the value comes from: a carrier upstream,
// never a terminal. Forward from `orphan`'s value, its `return` has no
// caller to carry it on, so downstream it is where the value ends.
function useLabel() {
  const label = "x";
  return label;
}

export function HookReturn() {
  const label = useLabel();
  return <span>{label}</span>;
}

export function orphan() {
  const value = "y";
  return value;
}
