// A small unified diff parser for the hunk view: hunks, line numbers, and word highlights.

export type DiffLineKind = "add" | "del" | "ctx" | "note";

export interface DiffSpan {
  text: string;
  /** True for the part of a paired line that changed. */
  hit: boolean;
}

export interface DiffLine {
  kind: DiffLineKind;
  old: number | null;
  new: number | null;
  text: string;
  /** Word highlights, only on a removed line paired with an added line. */
  spans?: DiffSpan[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the second `@@`, usually the enclosing function. */
  section: string;
  lines: DiffLine[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;
const FILE_HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) |old mode|new mode|Binary files )/;
/** Lines longer than this skip word highlights; the diff must stay fast. */
const MAX_HIGHLIGHT = 400;

export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  for (const raw of lines) {
    const head = HUNK.exec(raw);
    if (head) {
      hunk = {
        header: raw,
        oldStart: Number(head[1]),
        oldLines: head[2] === undefined ? 1 : Number(head[2]),
        newStart: Number(head[3]),
        newLines: head[4] === undefined ? 1 : Number(head[4]),
        section: head[5].trim(),
        lines: [],
      };
      hunks.push(hunk);
      oldNo = hunk.oldStart;
      newNo = hunk.newStart;
      continue;
    }
    if (!hunk || FILE_HEADER.test(raw)) continue;
    const sign = raw[0];
    const body = raw.slice(1);
    if (sign === "+") hunk.lines.push({ kind: "add", old: null, new: newNo++, text: body });
    else if (sign === "-") hunk.lines.push({ kind: "del", old: oldNo++, new: null, text: body });
    else if (sign === "\\") hunk.lines.push({ kind: "note", old: null, new: null, text: raw.slice(2) });
    // Some tools strip the space from an empty context line.
    else hunk.lines.push({ kind: "ctx", old: oldNo++, new: newNo++, text: sign === " " ? body : raw });
  }
  for (const h of hunks) pairWords(h.lines);
  return hunks;
}

/** Pair each run of removed lines with the added run after it, line by line, and mark the changed words. */
function pairWords(lines: DiffLine[]) {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "del") {
      i++;
      continue;
    }
    const delStart = i;
    while (i < lines.length && lines[i].kind === "del") i++;
    const addStart = i;
    while (i < lines.length && lines[i].kind === "add") i++;
    const pairs = Math.min(addStart - delStart, i - addStart);
    for (let k = 0; k < pairs; k++) markWords(lines[delStart + k], lines[addStart + k]);
  }
}

const TOKEN = /\w+|\s+|[^\w\s]/g;

/** Most token pairs compared by the LCS; longer pairs fall back to prefix and suffix. */
const MAX_LCS = 20000;

/** Tokens both lines share (a token LCS) stay plain; the rest is the change. */
export function markWords(del: DiffLine, add: DiffLine) {
  if (del.text.length > MAX_HIGHLIGHT || add.text.length > MAX_HIGHLIGHT) return;
  const a = del.text.match(TOKEN) ?? [];
  const b = add.text.match(TOKEN) ?? [];
  const [keepA, keepB] = a.length * b.length <= MAX_LCS ? lcs(a, b) : prefixSuffix(a, b);
  // Lines that share less than half their text were rewritten; scattered highlights would only add noise.
  const solid = (tokens: string[], keep?: boolean[]) =>
    tokens.reduce((n, t, i) => n + (keep && !keep[i] ? 0 : t.replace(/\s/g, "").length), 0);
  if (solid(a, keepA) < 0.5 * Math.min(solid(a), solid(b))) return;
  del.spans = spans(a, keepA);
  add.spans = spans(b, keepB);
}

function spans(tokens: string[], keep: boolean[]): DiffSpan[] {
  const out: DiffSpan[] = [];
  tokens.forEach((text, i) => {
    const hit = !keep[i];
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text;
    else out.push({ text, hit });
  });
  return out;
}

function lcs(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const keepA = new Array<boolean>(n).fill(false);
  const keepB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keepA[i++] = true;
      keepB[j++] = true;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return [keepA, keepB];
}

function prefixSuffix(a: string[], b: string[]): [boolean[], boolean[]] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const keep = (len: number) => Array.from({ length: len }, (_, i) => i < pre || i >= len - suf);
  return [keep(a.length), keep(b.length)];
}
