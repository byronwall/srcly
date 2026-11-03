// Storage by receiver and key. A setter the project declares runs when its
// property is assigned (`cell.current = token`), with the value as its
// parameter and the receiver as its `this`. A literal key (`bag["x"]`) is
// that field, apart from `bag.y`; a computed one (`bag[key]`) is some field,
// a `partial` step every read of `bag` may see. A member's state is still
// the class's, not one instance's: the setter's value reaches every `Cell`
// read of `value`, here the other methods' returns too.
export class Cell {
  constructor() {
    this.value = null;
  }
  set(item) {
    this.value = item;
  }
  get() {
    return this.value; // @reaches setter return
  }
  set current(item) {
    this.value = item;
  }
  get current() {
    return this.value; // @reaches setter return
  }
}

export function setterOnly(token) { // @trace setter forward symbol token
  const cell = new Cell();
  cell.current = token; // @edge setter argument-binding proven argument-binding
  return cell.value; // @reaches setter return
}

export function literalKeys(token, other) { // @trace key-x forward symbol token @trace key-y forward symbol other
  const bag = {};
  bag["x"] = token; // @reaches key-x index-read
  bag.y = other; // @reaches key-y field-read
  const x = bag.x; // @visits key-x field-read @never-reaches key-y field-read
  const y = bag["y"]; // @visits key-y index-read @never-reaches key-x index-read
  return [x, y]; // @reaches key-x return @reaches key-y return
}

export function dynamicKey(token, key) { // @trace key-dynamic forward symbol token
  const bag = {};
  bag[key] = token; // @edge key-dynamic pack-field partial @reaches key-dynamic index-read
  return bag.z; // @reaches key-dynamic return
}
