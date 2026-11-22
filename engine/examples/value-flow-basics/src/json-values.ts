// A value parsed from JSON is typed `any`, but it can only be null, a
// boolean, a number, a string, an array or a plain object, and none of them
// holds a function of its own. A method only one of those prototypes declares
// (`map` is only `Array`'s) is that standard method, so it is modelled.
export function names(text: string) { // @trace json-map forward symbol text @outcome json-map ok
  const rows = JSON.parse(text);
  return rows.map((row: { name: string }) => row.name); // @reaches json-map return @path json-map "rows" "name"
}

export async function loadNames(url: string) {
  const response = await fetch(url); // @reaches json-fetch fetch-input
  const rows = await response.json();
  // @trace json-fetch backward rows.map((row: { name: string }) => row.name) @outcome json-fetch ok
  return rows.map((row: { name: string }) => row.name);
}

// `slice` is both `Array`'s and `String`'s: which one runs is not known, so the call stays a stop.
export function rest(text: string) { // @trace json-slice forward symbol text @outcome json-slice partial
  const parsed = JSON.parse(text);
  return parsed.slice(1); // @stop json-slice unresolved-symbol @reaches json-slice return
}

// An untyped value of unknown origin stays a stop: `value-flow-js/src/untyped-receivers.js`.
