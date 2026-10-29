// A function anchored by name walks its body forward: each parameter reaches
// what the body does with it, and the function lands only when every input
// does. Before, only its returns and uses were walked, so `saveName` read
// `ok` without drawing `store.setItem` at all; now its input ends there, a
// named browser write.
export function saveName(name: string, store: Storage) { // @trace save-name forward symbol saveName @outcome save-name ok
  store.setItem("name", name.trim()); // @reaches save-name external-effect
  return name.length;
}

// A parameter that reaches the function's own return has landed: the return's run goes on from there.
export function wrapName(name: string) { // @trace wrap-name forward symbol wrapName @outcome wrap-name ok
  const label = name;
  return { label };
}
