export function reduceCommonIndent(
  lines: string[],
  opts?: { keepIndent?: number }
): { lines: string[]; reduced: boolean } {
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
    return { lines, reduced: false };
  }

  const kept = " ".repeat(keepIndent);
  const removed = Math.max(0, minIndent - keepIndent);
  const next = lines.map((line) => {
    if (!line.trim()) return "";
    const r = Math.min(removed, line.match(/^(\s*)/)?.[1]?.length ?? 0);
    if (r <= 0) return line;
    // Preserve keepIndent spaces on non-empty lines.
    return kept + line.slice(r + keepIndent);
  });

  return { lines: next, reduced: true };
}

