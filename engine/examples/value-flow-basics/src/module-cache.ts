// A module's own container that its file reads back keeps what a dropped
// library call puts into it: `cache.set(key, value)` reaches `cache.get(key)`.
// One the module only writes to (a log, `external-calls.tsx`) stops at the call.
const cache = new Map<string, string>();

export function remember(key: string, value: string) { // @trace cached forward symbol value @outcome cached ok
  cache.set(key, value);
}

export function recall(key: string) {
  return cache.get(key) ?? ""; // @reaches cached return
}
