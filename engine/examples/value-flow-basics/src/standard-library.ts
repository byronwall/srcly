// What TypeScript's own library does with a value is known, not assumed: a
// string's or array's methods, `JSON`, `Object` and `console` carry what
// they are given, so a trace through them can be `ok`.
export function summarise(names: string[]) { // @trace std forward symbol names @outcome std ok
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  const text = JSON.stringify(Object.fromEntries(cleaned.map((name) => [name, name.length])));
  console.log(text.toUpperCase()); // @reaches std
}
