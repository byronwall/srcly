// A return that is a call (`yield items.slice(…)`, an arrow's `() => f(x)`)
// belongs to its own function: whether it leaves the program is that
// function's call sites, not the call it returns. An exported generator no
// code iterates hands its values to the module's API. An arrow returning a
// call that is handed to a callback no caller binds does not end there.
export function* chunks(items: string[], size: number) { // @trace chunks forward symbol items @outcome chunks ok
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size); // @reaches chunks derived @reaches chunks return
}

export function later(run: (make: () => string) => void, text: string) { // @trace later forward symbol text
  run(() => text.trim()); // @stop later disconnected call @outcome later partial
}
