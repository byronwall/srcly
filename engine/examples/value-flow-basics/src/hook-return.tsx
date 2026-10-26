// A component that reads a hook's result. Backward from the render slot,
// the hook's `return` is where the value comes from: a carrier upstream,
// never a terminal. Forward from `orphan`'s value, its `return` has no
// caller to carry it on, so downstream it is where the value ends.
function useLabel() {
  const label = "x";
  return label; // @visits hook-back return
}

export function HookReturn() {
  const label = useLabel();
  return <span>{label}</span>; // @trace hook-back backward label @outcome hook-back ok
}

export function orphan() {
  const value = "y";
  return value; // @trace orphan-value forward value @outcome orphan-value ok @reaches orphan-value return
}
