export interface Point {
  x: number;
  y: number;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Polyline {
  id: string;
  source: string;
  target: string;
  points: Point[];
}

interface Segment {
  a: Point;
  b: Point;
}

const EPS = 0.5;

export function segments(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) out.push({ a: points[i], b: points[i + 1] });
  return out;
}

export function isOrthogonal(points: Point[]): boolean {
  return segments(points).every(
    ({ a, b }) => Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS,
  );
}

/** Does an axis-aligned segment pass through the interior of the box? */
export function segmentHitsBox(seg: Segment, box: Box, inset = 1): boolean {
  const x0 = box.x + inset;
  const x1 = box.x + box.width - inset;
  const y0 = box.y + inset;
  const y1 = box.y + box.height - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  const sx0 = Math.min(seg.a.x, seg.b.x);
  const sx1 = Math.max(seg.a.x, seg.b.x);
  const sy0 = Math.min(seg.a.y, seg.b.y);
  const sy1 = Math.max(seg.a.y, seg.b.y);
  return sx1 > x0 && sx0 < x1 && sy1 > y0 && sy0 < y1;
}

/** Number of (edge, box) pairs where the edge passes through a box interior. */
export function countNodeCrossings(edges: Polyline[], boxes: Box[]): { count: number; examples: string[] } {
  let count = 0;
  const examples: string[] = [];
  for (const e of edges) {
    for (const box of boxes) {
      if (segments(e.points).some((s) => segmentHitsBox(s, box))) {
        count++;
        if (examples.length < 10) examples.push(`${e.id} ✕ ${box.id}`);
      }
    }
  }
  return { count, examples };
}

/** Proper crossings between perpendicular segments of different edges. */
export function countEdgeCrossings(edges: Polyline[]): number {
  const hs: { y: number; x0: number; x1: number; e: number }[] = [];
  const vs: { x: number; y0: number; y1: number; e: number }[] = [];
  edges.forEach((edge, i) => {
    for (const { a, b } of segments(edge.points)) {
      if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS) {
        hs.push({ y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), e: i });
      } else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) {
        vs.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), e: i });
      }
    }
  });
  const seen = new Set<string>();
  for (const h of hs) {
    for (const v of vs) {
      if (h.e === v.e) continue;
      if (v.x > h.x0 + EPS && v.x < h.x1 - EPS && h.y > v.y0 + EPS && h.y < v.y1 - EPS) {
        // Bundled edges cross the same line together; count each crossing point once.
        seen.add(`${Math.round(v.x / 3)}:${Math.round(h.y / 3)}`);
      }
    }
  }
  return seen.size;
}

export function boundsOf(boxes: Box[], edges: Polyline[] = []): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  for (const e of edges) {
    for (const p of e.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Pairs of collinear segments from different edges that run on top of each
 * other for more than `minOverlap` px — edges a reader cannot tell apart.
 */
export function countOverlaps(edges: Polyline[], minOverlap = 1): number {
  const hs = new Map<number, { lo: number; hi: number; e: number }[]>();
  const vs = new Map<number, { lo: number; hi: number; e: number }[]>();
  edges.forEach((edge, i) => {
    for (const { a, b } of segments(edge.points)) {
      if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS) {
        const k = Math.round(a.y * 4);
        hs.set(k, [...(hs.get(k) ?? []), { lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), e: i }]);
      } else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) {
        const k = Math.round(a.x * 4);
        vs.set(k, [...(vs.get(k) ?? []), { lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), e: i }]);
      }
    }
  });
  let count = 0;
  for (const lines of [hs, vs]) {
    for (const segs of lines.values()) {
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          if (segs[i].e === segs[j].e) continue;
          if (Math.min(segs[i].hi, segs[j].hi) - Math.max(segs[i].lo, segs[j].lo) > minOverlap) count++;
        }
      }
    }
  }
  return count;
}

/**
 * Crossings between bundles rather than between individual edges: parallel
 * segments within `spread` px of each other (an edge bundle drawn as a band)
 * count as one line, so widening a bundle doesn't inflate the count.
 */
export function countBundleCrossings(edges: Polyline[], spread = 2.01): number {
  type Seg = { at: number; lo: number; hi: number; e: number };
  const hs: Seg[] = [];
  const vs: Seg[] = [];
  edges.forEach((edge, i) => {
    for (const { a, b } of segments(edge.points)) {
      if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS) hs.push({ at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), e: i });
      else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) vs.push({ at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), e: i });
    }
  });
  // Union neighbors along the cross axis whose spans overlap: one bundle each.
  const bundles = (segs: Seg[]): number[] => {
    const order = segs.map((_, i) => i).sort((p, q) => segs[p].at - segs[q].at);
    const parent = segs.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length && segs[order[j]].at - segs[order[i]].at <= spread; j++) {
        const [p, q] = [segs[order[i]], segs[order[j]]];
        if (Math.min(p.hi, q.hi) > Math.max(p.lo, q.lo)) parent[find(order[i])] = find(order[j]);
      }
    }
    return segs.map((_, i) => find(i));
  };
  const hb = bundles(hs);
  const vb = bundles(vs);
  const seen = new Set<string>();
  hs.forEach((h, i) => {
    vs.forEach((v, j) => {
      if (h.e === v.e) return;
      if (v.at > h.lo + EPS && v.at < h.hi - EPS && h.at > v.lo + EPS && h.at < v.hi - EPS) seen.add(`${hb[i]}:${vb[j]}`);
    });
  });
  return seen.size;
}
