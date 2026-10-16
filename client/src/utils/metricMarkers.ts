/** Where a metric fires in a file, from `GET /api/files/markers`. */
export interface MetricMarker {
  line: number;
  end_line: number;
  note: string;
}

export type MetricMarkers = Record<string, MetricMarker[]>;

/** One overlaid line: every marker that starts on it, notes merged. */
export interface MarkerHit {
  line: number;
  endLine: number;
  notes: string[];
}

// Metrics located by another metric's markers: the average complexity is
// made of the same decision points as the max.
const MARKER_SOURCE: Record<string, string> = {
  complexity_avg: "complexity",
};

export function markersFor(markers: MetricMarkers | null, metricId: string): MetricMarker[] {
  if (!markers) return [];
  return markers[MARKER_SOURCE[metricId] ?? metricId] ?? [];
}

export function hasMarkers(markers: MetricMarkers | null, metricId: string): boolean {
  return markersFor(markers, metricId).length > 0;
}

/** Merge markers by starting line, sorted; repeated notes collapse to "&& ×3". */
export function groupHits(markers: MetricMarker[]): MarkerHit[] {
  const byLine = new Map<number, { endLine: number; notes: string[] }>();
  for (const m of markers) {
    const hit = byLine.get(m.line) ?? { endLine: m.line, notes: [] };
    hit.endLine = Math.max(hit.endLine, m.end_line);
    if (m.note) hit.notes.push(m.note);
    byLine.set(m.line, hit);
  }
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, hit]) => ({ line, endLine: hit.endLine, notes: collapseNotes(hit.notes) }));
}

function collapseNotes(notes: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].map(([note, count]) => (count > 1 ? `${note} ×${count}` : note));
}

/** Hits that overlap the inclusive line range. */
export function hitsInRange(hits: MarkerHit[], start: number, end: number): MarkerHit[] {
  return hits.filter((h) => h.endLine >= start && h.line <= end);
}

/** The next (or previous) hit from `line`, wrapping around. */
export function stepHit(hits: MarkerHit[], line: number | null, direction: 1 | -1): MarkerHit | null {
  if (!hits.length) return null;
  if (line === null) return direction === 1 ? hits[0] : hits[hits.length - 1];
  if (direction === 1) return hits.find((h) => h.line > line) ?? hits[0];
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].line < line) return hits[i];
  return hits[hits.length - 1];
}

/** File line → note, for every displayed line covered by a hit. */
export function lineDecorations(hits: MarkerHit[]): Map<number, { note: string; first: boolean }> {
  const out = new Map<number, { note: string; first: boolean }>();
  for (const h of hits) {
    for (let line = h.line; line <= h.endLine; line++) {
      if (!out.has(line)) out.set(line, { note: line === h.line ? h.notes.join(", ") : "", first: line === h.line });
    }
  }
  return out;
}
