export type LineRange = { start: number; end: number };

export function computeDisplaySlice(args: {
  text: string;
  useLineFilter: boolean;
  target: LineRange | null;
  offset: number;
}): {
  displayText: string;
  start: number;
  end: number;
  linesToDisplay: string[];
  totalLines: number;
} {
  const lines = args.text.split(/\r?\n/);
  const totalLines = lines.length;

  if (!args.useLineFilter || !args.target) {
    return {
      displayText: args.text,
      start: 1,
      end: totalLines,
      linesToDisplay: lines,
      totalLines,
    };
  }

  const safeOffset = Math.max(0, Math.floor(args.offset));
  const rawStart = args.target.start - safeOffset;
  const rawEnd = args.target.end + safeOffset;

  const start = Math.max(1, rawStart);
  const end = Math.min(totalLines, rawEnd);

  if (end < start) {
    return {
      displayText: args.text,
      start: 1,
      end: totalLines,
      linesToDisplay: lines,
      totalLines,
    };
  }

  const linesToDisplay = lines.slice(start - 1, end);
  return {
    displayText: linesToDisplay.join("\n"),
    start,
    end,
    linesToDisplay,
    totalLines,
  };
}


