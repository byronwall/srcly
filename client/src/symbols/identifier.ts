/** The identifier under a 1-based column of a source line, or null when the caret is not on one. */
export function identifierAt(line: string, column: number): string | null {
  return identifierRangeAt(line, column)?.name ?? null;
}

/** The identifier at a 1-based column and the 1-based column of its first character: a caret on either side of a letter finds it. */
export function identifierRangeAt(line: string, column: number): { name: string; column: number } | null {
  const i = Math.min(Math.max(column - 1, 0), line.length);
  const word = /[A-Za-z0-9_$#]/;
  if (!word.test(line[i] ?? "") && !word.test(line[i - 1] ?? "")) return null;
  let start = word.test(line[i] ?? "") ? i : i - 1;
  while (start > 0 && word.test(line[start - 1])) start -= 1;
  let end = start;
  while (end < line.length && word.test(line[end])) end += 1;
  const name = line.slice(start, end);
  return /^[A-Za-z_$#]/.test(name) ? { name, column: start + 1 } : null;
}
