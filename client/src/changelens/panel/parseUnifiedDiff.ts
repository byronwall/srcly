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

/** Common prefix and suffix tokens stay plain; the middle is the change. */
export function markWords(del: DiffLine, add: DiffLine) {
  if (del.text.length > MAX_HIGHLIGHT || add.text.length > MAX_HIGHLIGHT) return;
  const a = del.text.match(TOKEN) ?? [];
  const b = add.text.match(TOKEN) ?? [];
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  // Nothing in common: the whole line changed, and a highlight would only add noise.
  if (pre + suf === 0) return;
  const split = (tokens: string[]): DiffSpan[] =>
    [
      { text: tokens.slice(0, pre).join(""), hit: false },
      { text: tokens.slice(pre, tokens.length - suf).join(""), hit: true },
      { text: tokens.slice(tokens.length - suf).join(""), hit: false },
    ].filter((s) => s.text);
  del.spans = split(a);
  add.spans = split(b);
}
