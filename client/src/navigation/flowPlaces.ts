// Anchor history (T18): the data-flow places visited in this tab, from the
// same visit ring as the header's History menu (sessionStorage only), with
// labels that name the anchor or route rather than the focused folder.
import type { HistoryEntry } from "./history";
import { isDataFlow, parseAnchor, type Location } from "./location";

export interface FlowPlaceLabel {
  kind: "anchor" | "route" | "exports";
  /** The anchor's name or span, or the route's path pattern. */
  leaf: string;
  /** The anchor's file, or null for a route. */
  detail: string | null;
  /** Anchor mode: which way it was traced. */
  dir: "forward" | "backward" | "both" | null;
}

/** Names a route key (`route:…`) by its path pattern when the list is known. */
export type RouteNamer = (key: string) => string;

/** What to call a data-flow place: `null` for a place that is not one (or Data flow mode with no route yet). */
export function flowPlaceLabel(loc: Location, routeName: RouteNamer = (key) => key): FlowPlaceLabel | null {
  if (loc.anchor !== undefined) {
    const spec = parseAnchor(loc.anchor);
    if (!spec) return { kind: "anchor", leaf: loc.anchor, detail: null, dir: loc.dir ?? "both" };
    // A file or folder anchor (T19): named by its path, traced through its exports.
    if ("exports" in spec) return { kind: "exports", leaf: spec.file || ".", detail: "exports", dir: loc.dir ?? "both" };
    if ("element" in spec) return { kind: "anchor", leaf: `box in ${spec.file.slice(spec.file.lastIndexOf("/") + 1)}`, detail: spec.file, dir: loc.dir ?? "both" };
    const leaf = "name" in spec ? spec.name : `${spec.span.startLine}:${spec.span.startColumn}–${spec.span.endLine}:${spec.span.endColumn}`;
    return { kind: "anchor", leaf, detail: spec.file, dir: loc.dir ?? "both" };
  }
  if (loc.flow) return { kind: "route", leaf: routeName(loc.flow), detail: null, dir: null };
  return null;
}

export const RECENT_FLOW_PLACES = 12;

/** The data-flow places visited in `repo`, newest first, each with its label; the current place included. */
export function recentFlowPlaces(entries: readonly HistoryEntry[], repo: string, routeName?: RouteNamer, limit = RECENT_FLOW_PLACES): { entry: HistoryEntry; label: FlowPlaceLabel }[] {
  const out: { entry: HistoryEntry; label: FlowPlaceLabel }[] = [];
  for (const entry of entries) {
    if (entry.loc.repo !== repo || !isDataFlow(entry.loc)) continue;
    const label = flowPlaceLabel(entry.loc, routeName);
    if (!label) continue;
    out.push({ entry, label });
    if (out.length >= limit) break;
  }
  return out;
}
