// The same helper twice, in a file with no types: each value stays with its
// own call. `@no-path` catches a route that crosses to the other consumer even
// though `console.log` is a legal end for the first value.
function identity(value) {
  return value;
}

export function pair(first, second) {
  // @trace js-first both symbol first
  const kept = identity(first); // @path js-first "first" "kept" @no-path js-first "first" "other"
  const other = identity(second);
  console.log(kept); // @reaches js-first stdout @reaches js-first external-effect
  console.warn(other);
}
