// An untyped parameter may hold any object, whatever a method's name says:
// `items.reduce` could be a project's own `reduce`, so the call stays a stop,
// named. A value parsed from JSON has only standard prototypes, so its `map`
// is `Array`'s (`value-flow-basics/src/json-values.ts`).
export function total(items) { // @trace js-any-reduce forward symbol items @outcome js-any-reduce partial
  return items.reduce((sum, item) => sum + item.price, 0); // @stop js-any-reduce unresolved-symbol @reaches js-any-reduce return
}

export function names(text) { // @trace js-json-map forward symbol text @outcome js-json-map ok
  const rows = JSON.parse(text);
  return rows.map((row) => row.name); // @reaches js-json-map return @path js-json-map "rows" "name"
}
