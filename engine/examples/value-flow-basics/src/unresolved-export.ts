// A binding handed out as the default export, in parentheses: an importer can write it.
const shared = { k: "OLD" }; // @produces fu-export none proven @caveat fu-export mutable
export default (shared);
export function readShared() {
  return shared.k; // @trace fu-export backward shared.k
}
