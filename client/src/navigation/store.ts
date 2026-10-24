import { createSignal } from "solid-js";
import { DEFAULT_FILTERS, type FilterOptions } from "../viz/deps/hierarchy";
import { HistoryRing, type HistoryEntry } from "./history";
import { parseLocation, ROOT_LOCATION, sameLocation, toSearch, type Location } from "./location";
import { captureViewState, clearPendingViewState, loadViewState, newViewStateToken, registerViewState, restoreViewState, saveViewState } from "./viewState";

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

// ---- view state (T17): every history entry owns a token; the place's view
// state (camera, selection, metric, filters) is stashed under it when the
// entry is left and restored when Back, Forward or Return lands on it again.
type EntryState = { srclyView?: string; srclyDepth?: number };
const entryState = (): EntryState => (hasWindow && window.history.state && typeof window.history.state === "object" ? (window.history.state as EntryState) : {});
/** The token of the entry the tab is on; assigned on first use. */
let currentToken: string | null = entryState().srclyView ?? null;
/** The URL search of that entry, as it is when left: on popstate the URL has already moved on. */
let currentSearch = hasWindow ? window.location.search : "";
function ensureToken(): string {
  if (currentToken) return currentToken;
  currentToken = newViewStateToken();
  window.history.replaceState({ ...entryState(), srclyView: currentToken }, "", window.location.href);
  return currentToken;
}
/** Stash what the owners hold for the entry the tab is leaving. */
function stash() {
  saveViewState(ensureToken(), captureViewState(currentSearch));
}
/** How many places back this tab can return to; the first entry has none. */
const [returnDepth, setReturnDepth] = createSignal<number>(entryState().srclyDepth ?? 0);
export const canReturn = () => returnDepth() > 0;

function write(next: Location, mode: "push" | "replace") {
  const href = `${window.location.pathname}${toSearch(next, window.location.search)}${window.location.hash}`;
  if (mode === "push") {
    stash();
    clearPendingViewState();
    const depth = (entryState().srclyDepth ?? 0) + 1;
    currentToken = newViewStateToken();
    window.history.pushState({ ...entryState(), srclyView: currentToken, srclyDepth: depth }, "", href);
    setReturnDepth(depth);
  } else {
    window.history.replaceState(window.history.state, "", href);
  }
  currentSearch = window.location.search;
  visit(next);
}

/** Back to the previous place as it was left: the URL by the browser, the rest from its snapshot. */
export function returnBack() {
  if (canReturn()) window.history.back();
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
  window.addEventListener("popstate", () => {
    // The entry just left keeps its state for Forward; the one landed on gets its own back.
    const leaving = currentToken;
    if (leaving) saveViewState(leaving, captureViewState(currentSearch));
    currentSearch = window.location.search;
    const state = entryState();
    currentToken = state.srclyView ?? null;
    setReturnDepth(state.srclyDepth ?? 0);
    visit(parseLocation(window.location.search));
    const snapshot = currentToken ? loadViewState(currentToken) : null;
    if (snapshot && snapshot.search === window.location.search) restoreViewState(snapshot);
    else clearPendingViewState();
  });
  // Canonicalize a legacy `?depFocus=` link once, so the URL shows `at`/`view`.
  if (new URLSearchParams(window.location.search).has("depFocus")) replace({});
  else visit(location());
}

// Graph filters (External, Tests, Type-only) belong to the session, not the
// graph view, so switching to the treemap and back keeps them.
const [graphFilters, setGraphFilters] = createSignal<FilterOptions>(DEFAULT_FILTERS);
registerViewState<FilterOptions>("graph.filters", { capture: () => graphFilters(), restore: (f) => setGraphFilters({ ...DEFAULT_FILTERS, ...f }) });

export { graphFilters, history, location, setGraphFilters };
