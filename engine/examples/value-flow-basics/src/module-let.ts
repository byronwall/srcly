// A module-level `let` written by one function and read by another: the read
// sees each binding that can reach it, the initializer and every assignment,
// since the functions may run in any order. `module-cache.ts` is the same
// rule for a module's own container.
let current = "none";

export function select(name: string) { // @trace module-let forward symbol name @outcome module-let ok
  current = name;
}

export function selected() {
  return current; // @reaches module-let return
}

// A module `let` that nothing reads back keeps the value nowhere: the trace stops at the assignment.
let lastSeen = "";

export function note(seen: string) { // @trace module-let-unread forward symbol seen @outcome module-let-unread partial
  lastSeen = seen; // @stop module-let-unread disconnected
}
