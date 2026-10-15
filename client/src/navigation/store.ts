import { createSignal } from "solid-js";
import { DEFAULT_FILTERS, type FilterOptions } from "../viz/deps/hierarchy";
import { HistoryRing, type HistoryEntry } from "./history";
import { parseLocation, ROOT_LOCATION, sameLocation, toSearch, type Location } from "./location";

// The URL is the source of truth: `location()` is parsed from it, `go` pushes a
// history entry, `replace` rewrites the current one, and Back/Forward
// (popstate) re-read it. Views read `location()` and call `go`; none of them
// touch the URL themselves.

const hasWindow = typeof window !== "undefined";
const HISTORY_KEY = "srcly-nav-history";

const [location, setLocation] = createSignal<Location>(
  hasWindow ? parseLocation(window.location.search) : ROOT_LOCATION,
  { equals: sameLocation }
);

// Places visited in this tab, newest first. In memory, mirrored to
// sessionStorage so a refresh keeps the list.
const ring = (() => {
  try {
    const raw = hasWindow ? window.sessionStorage.getItem(HISTORY_KEY) : null;
    return HistoryRing.fromJSON(raw ? JSON.parse(raw) : []);
  } catch {
    return new HistoryRing();
  }
})();
const [history, setHistory] = createSignal<readonly HistoryEntry[]>(ring.entries());

function visit(loc: Location) {
  setLocation(loc);
  if (!loc.repo) return;
  ring.record(loc, Date.now());
  setHistory(ring.entries());
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(ring));
  } catch {
    // Storage is a convenience; the in-memory list still works.
  }
}

function write(next: Location, mode: "push" | "replace") {
  const href = `${window.location.pathname}${toSearch(next, window.location.search)}${window.location.hash}`;
  if (mode === "push") window.history.pushState(window.history.state, "", href);
  else window.history.replaceState(window.history.state, "", href);
  visit(next);
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
  window.addEventListener("popstate", () => visit(parseLocation(window.location.search)));
  // Canonicalize a legacy `?depFocus=` link once, so the URL shows `at`/`view`.
  if (new URLSearchParams(window.location.search).has("depFocus")) replace({});
  else visit(location());
}

// Graph filters (External, Tests, Type-only) belong to the session, not the
// graph view, so switching to the treemap and back keeps them.
const [graphFilters, setGraphFilters] = createSignal<FilterOptions>(DEFAULT_FILTERS);

export { graphFilters, history, location, setGraphFilters };
