// A function made inside a call and called later (a closure) returns from a
// function that call never entered: its value leaves through the closure's
// own calls, not the factory's.
function makeReader(value: string) {
  return { read: () => value, size: () => value.length };
}

export function readBack(value: string) { // @trace closure forward symbol value @outcome closure ok
  const reader = makeReader(value);
  console.log(reader.read()); // @reaches closure
  console.log(reader.size()); // @reaches closure
}
