// An exported value nothing in the program reads ends at its export: code
// outside the program may read it, so its walk has reached the module's API,
// not a dead end. That holds however it is exported (`export const`,
// `export { … }`, `export default`). A value the program does read walks on
// to where it is read, and an unexported value nothing reads is dead code.
export const SHOWN = { label: "shown" }; // @trace shown forward symbol SHOWN @outcome shown ok @reaches shown alias "SHOWN"

const listed = ["a", "b"]; // @trace listed forward symbol listed @outcome listed ok @reaches listed alias "listed"
// eslint-disable-next-line no-restricted-syntax -- the fixture needs a separate export statement
export { listed };

const fallback = { label: "fallback" }; // @trace fallback forward symbol fallback @outcome fallback ok @reaches fallback alias "fallback"
export default fallback;

export const used = { label: "used" }; // @trace used forward symbol used @outcome used ok

export function labelOf(): string {
  return used.label; // @reaches used return
}

const hidden = { label: "hidden" }; // @trace hidden forward symbol hidden @outcome hidden partial @stop hidden disconnected alias "hidden"

// Read through its module (`api.READ_BY_NAMESPACE`), so not the module's API end. The evidence does
// not yet follow a namespace member read, so this stays a dead end until it does.
export const READ_BY_NAMESPACE = { label: "namespace" }; // @trace by-namespace forward symbol READ_BY_NAMESPACE @outcome by-namespace partial @stop by-namespace disconnected alias
