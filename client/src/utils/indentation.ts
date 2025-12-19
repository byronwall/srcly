export function reduceCommonIndent(
  lines: string[],
  opts?: { keepIndent?: number }
): { lines: string[]; reduced: boolean; removedIndentByLine: number[] } {
  const keepIndent = Math.max(0, Math.floor(opts?.keepIndent ?? 2));

  let minIndent = Number.POSITIVE_INFINITY;
  let hasNonEmptyLine = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    hasNonEmptyLine = true;
    const match = line.match(/^(\s*)/);
    minIndent = Math.min(minIndent, match ? match[1].length : 0);
  }

  if (!hasNonEmptyLine || !Number.isFinite(minIndent) || minIndent <= keepIndent) {
    return { lines, reduced: false, removedIndentByLine: lines.map(() => 0) };
  }

  const kept = " ".repeat(keepIndent);
  const removed = Math.max(0, minIndent - keepIndent);
  const removedIndentByLine = lines.map((line) => {
    if (!line.trim()) return 0;
    return Math.min(removed, line.match(/^(\s*)/)?.[1]?.length ?? 0);
  });

  const next = lines.map((line, i) => {
    if (!line.trim()) return "";
    const r = removedIndentByLine[i] ?? 0;
    if (r <= 0) return line;
    // Preserve keepIndent spaces on non-empty lines.
    return kept + line.slice(r + keepIndent);
  });

  return { lines: next, reduced: true, removedIndentByLine };
}


