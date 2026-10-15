import { createSignal } from "solid-js";
import { parseLocation, sameLocation, toSearch, type Location } from "./location";

// The URL is the source of truth: `location()` is parsed from it, `go` pushes a
// history entry, `replace` rewrites the current one, and Back/Forward
// (popstate) re-read it. Views read `location()` and call `go`; none of them
// touch the URL themselves.

const hasWindow = typeof window !== "undefined";

const [location, setLocation] = createSignal<Location>(
  hasWindow ? parseLocation(window.location.search) : { at: "", view: "treemap" },
  { equals: sameLocation }
);

function write(next: Location, mode: "push" | "replace") {
  const href = `${window.location.pathname}${toSearch(next, window.location.search)}${window.location.hash}`;
  if (mode === "push") window.history.pushState(window.history.state, "", href);
  else window.history.replaceState(window.history.state, "", href);
  setLocation(next);
}

/** Move to a new place, adding a Back step. A no-op when nothing changes. */
export function go(patch: Partial<Location>) {
  const next = { ...location(), ...patch };
  if (sameLocation(next, location())) return;
  write(next, "push");
}

/** Correct the current place in place (redirects, fallbacks). No Back step. */
export function replace(patch: Partial<Location>) {
  write({ ...location(), ...patch }, "replace");
}

if (hasWindow) {
  window.addEventListener("popstate", () => setLocation(parseLocation(window.location.search)));
  // Canonicalize a legacy `?depFocus=` link once, so the URL shows `at`/`view`.
  if (new URLSearchParams(window.location.search).has("depFocus")) replace({});
}

export { location };
