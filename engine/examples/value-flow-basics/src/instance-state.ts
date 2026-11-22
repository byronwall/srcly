// State kept per call or per instance: a closure a factory made, a class
// field. Each factory call and each `new` is its own context, so a value
// written into one instance's state reaches only that instance's reads. The
// instance is named by the call or `new` a receiver came from (`const la =
// makeLabel(…)`); where no name says which instance it is (an element of an
// array), the trace still reaches every reader, but says `assumed`.
function makeLabel(value: string) {
  return { read: () => value };
}

export function twoLabels(aval: string, bval: string) {
  const la = makeLabel(aval); // @trace two-labels forward aval @outcome two-labels ok
  const lb = makeLabel(bval);
  console.log("A", la.read()); // @reaches two-labels
  console.warn("B", lb.read()); // @never-reaches two-labels
}

export function labelsBack(gval: string, hval: string) { // @stop labels-back untraced parameter "gval"
  const lg = makeLabel(gval); // @visits labels-back value "gval"
  const lh = makeLabel(hval); // @never-reaches labels-back
  console.log("G", lg.read()); // @trace labels-back backward lg.read() @outcome labels-back partial
  console.warn("H", lh.read());
}

// A `let` one returned function writes and another reads belongs to the
// factory call that made both.
function makeCell(start: number) {
  let state = start;
  return { get: () => state, set: (next: number) => { state = next; } };
}

export function twoCells(xval: number) {
  const ca = makeCell(0);
  const cb = makeCell(1);
  ca.set(xval); // @trace two-cells forward xval @outcome two-cells ok
  console.log("A", ca.get()); // @reaches two-cells
  console.warn("B", cb.get()); // @never-reaches two-cells
}

class Box {
  constructor(private value: string) {}
  get() {
    return this.value;
  }
}

export function twoBoxes(cval: string, dval: string) {
  const bc = new Box(cval); // @trace two-boxes forward cval @outcome two-boxes ok
  const bd = new Box(dval);
  console.log("C", bc.get()); // @reaches two-boxes
  console.warn("D", bd.get()); // @never-reaches two-boxes
}

// A field one method writes and another reads, through `this`.
class Slot {
  private held = "";
  put(next: string) {
    this.held = next;
  }
  take() {
    return this.held;
  }
}

export function twoSlots(sval: string) {
  const sa = new Slot();
  const sb = new Slot();
  sa.put(sval); // @trace two-slots forward sval @outcome two-slots ok
  console.log("A", sa.take()); // @reaches two-slots
  console.warn("B", sb.take()); // @never-reaches two-slots
}

// Instances in an array: nothing names which one `pile[0]` is.
class Pile {
  private top = "";
  push(next: string) {
    this.top = next;
  }
  peek() {
    return this.top;
  }
}

export function pileArray(tval: string) {
  const pile = [new Pile(), new Pile()];
  pile[0]!.push(tval); // @trace pile-array forward tval @outcome pile-array assumed
  console.log("A", pile[0]!.peek()); // @reaches pile-array
  console.warn("B", pile[1]!.peek()); // @reaches pile-array
}

// A closure called in its factory's own body (a local helper) runs in the
// frame that called the factory: it adds no instance of its own.
function exclaim(word: string) {
  const echo = () => word;
  return `${echo()}!`;
}

export function twoExclaims(mval: string, nval: string) { // @stop exclaims-back untraced parameter "mval"
  const em = exclaim(mval); // @trace exclaims forward mval @outcome exclaims ok @visits exclaims-back value "mval"
  const en = exclaim(nval); // @never-reaches exclaims-back
  console.log("M", em); // @reaches exclaims @trace exclaims-back backward em @outcome exclaims-back partial @no-edge exclaims-back * * shared-instance
  console.warn("N", en); // @never-reaches exclaims
}
