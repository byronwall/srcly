// State kept per call or per instance (a closure a factory made, a class
// field) is not yet told apart by call: the engine joins every instance's
// writes to every instance's reads. With one factory call or one `new`, that
// join is exact and the trace is `ok`. With more than one, a value can reach
// another instance's read, so the trace says `assumed` instead of `ok`.
function makeLabel(value: string) {
  return { read: () => value };
}

export function twoLabels(aval: string, bval: string) {
  const la = makeLabel(aval); // @trace two-labels forward aval @outcome two-labels assumed
  const lb = makeLabel(bval);
  console.log("A", la.read()); // @reaches two-labels
  console.warn("B", lb.read()); // @reaches two-labels
}

class Box {
  constructor(private value: string) {}
  get() {
    return this.value;
  }
}

export function twoBoxes(cval: string, dval: string) {
  const bc = new Box(cval); // @trace two-boxes forward cval @outcome two-boxes assumed
  const bd = new Box(dval);
  console.log("C", bc.get()); // @reaches two-boxes
  console.warn("D", bd.get()); // @reaches two-boxes
}
