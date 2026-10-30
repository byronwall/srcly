// What TypeScript's own library does with a value is known, not assumed: a
// string's or array's methods, `JSON`, `Object` and `console` carry what
// they are given, so a trace through them can be `ok`.
export function summarise(names: string[]) { // @trace std forward symbol names @outcome std ok
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  const text = JSON.stringify(Object.fromEntries(cleaned.map((name) => [name, name.length])));
  console.log(text.toUpperCase()); // @reaches std
}

// A promise's executor is handed `resolve` by the standard library: calling it
// hands the value back to the promise, so the value reaches the function's return.
export function later(ms: number, value: string) { // @trace resolved forward symbol value @outcome resolved ok
  return new Promise<string>((resolve) => setTimeout(() => resolve(value), ms)); // @reaches resolved return @reaches resolved call "resolve(value)"
}
