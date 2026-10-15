import { sameLocation, type Location } from "./location";

export interface HistoryEntry {
  loc: Location;
  /** Epoch ms of the latest visit. */
  time: number;
}

export const HISTORY_CAPACITY = 30;

/**
 * The places visited in this tab, most recent first. Revisiting a place moves
 * it to the top instead of adding a duplicate, so the list stays a set of
 * distinct places to jump to.
 */
export class HistoryRing {
  private items: HistoryEntry[];
  readonly capacity: number;

  constructor(capacity = HISTORY_CAPACITY, entries: HistoryEntry[] = []) {
    this.capacity = capacity;
    this.items = entries.slice(0, capacity);
  }

  record(loc: Location, time: number): void {
    this.items = [
      { loc: { ...loc }, time },
      ...this.items.filter((e) => !sameLocation(e.loc, loc)),
    ].slice(0, this.capacity);
  }

  entries(): readonly HistoryEntry[] {
    return this.items;
  }

  toJSON(): HistoryEntry[] {
    return this.items;
  }

  /** Rebuilds a ring from stored JSON, dropping anything malformed. */
  static fromJSON(raw: unknown, capacity = HISTORY_CAPACITY): HistoryRing {
    const valid = Array.isArray(raw)
      ? raw.filter(
          (e): e is HistoryEntry =>
            !!e &&
            typeof e.time === "number" &&
            !!e.loc &&
            typeof e.loc.repo === "string" &&
            typeof e.loc.at === "string" &&
            (e.loc.view === "treemap" || e.loc.view === "graph")
        )
      : [];
    return new HistoryRing(capacity, valid);
  }
}

/** "now", "45s", "12m", "3h", "2d". */
export function shortAge(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
