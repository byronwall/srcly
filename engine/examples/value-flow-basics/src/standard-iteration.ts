// The standard library's iteration and promise helpers carry their values on:
// `Promise.all` to the destructured result, `Object.entries` to the pair's
// key and value, a default to the destructured binding it may replace.
export async function both(a: string) { // @trace all-arg forward symbol a
  const [x] = await Promise.all([Promise.resolve(a), Promise.resolve("b")]);
  return x; // @reaches all-arg return
}

export function entries(map: Record<string, number>) { // @trace entries-arg forward symbol map
  return Object.entries(map).map(([key, value]) => `${key}=${value}`); // @reaches entries-arg return
}

export function withDefault(input?: string) { // @trace default-arg forward symbol input
  const { value = "x" } = { value: input };
  return value; // @reaches default-arg return
}
