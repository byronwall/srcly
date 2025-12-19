import { codeToHtml } from "shiki";
import { createEffect, createSignal } from "solid-js";
import { guessLangFromPath } from "../utils/guessLangFromPath";
import { reduceCommonIndent } from "../utils/indentation";
import { computeDisplaySlice, type LineRange } from "../utils/lineRange";
import {
  applyLineNumberCounterReset,
  markNonFocusLines,
  stripShikiPreNewlines,
} from "../utils/shikiHtml";
import {
  applyFlowDecorations,
  type OverlayToken,
} from "../utils/flowDecorations";

export function useHighlightedCode(args: {
  rawCode: () => string;
  filePath: () => string | null;
  lineFilterEnabled: () => boolean;
  lineOffset: () => number;
  targetStart: () => number | null;
  targetEnd: () => number | null;
  reduceIndentation: () => boolean;
}) {
  const [highlightedHtml, setHighlightedHtml] = createSignal("");
  const [displayStartLine, setDisplayStartLine] = createSignal<number | null>(
    null
  );
  const [displayEndLine, setDisplayEndLine] = createSignal<number | null>(null);
  const [wasIndentationReduced, setWasIndentationReduced] = createSignal(false);

  let lastProcessId = 0;

  createEffect(() => {
    const text = args.rawCode();
    const path = args.filePath();
    const useLineFilter = args.lineFilterEnabled();
    const offset = args.lineOffset();
    const shouldReduceIndent = args.reduceIndentation();
    const tStart = args.targetStart();
    const tEnd = args.targetEnd();

    if (!text || !path) {
      setHighlightedHtml("");
      setDisplayStartLine(null);
      setDisplayEndLine(null);
      setWasIndentationReduced(false);
      return;
    }

    const target: LineRange | null =
      typeof tStart === "number" && typeof tEnd === "number"
        ? { start: tStart, end: tEnd }
        : null;

    const currentProcessId = ++lastProcessId;

    (async () => {
      const slice = computeDisplaySlice({
        text,
        useLineFilter,
        target,
        offset,
      });

      let linesToDisplay = slice.linesToDisplay;
      let isReduced = false;
      let removedIndentByLine: number[] | null = null;

      if (shouldReduceIndent) {
        const reduced = reduceCommonIndent(linesToDisplay, { keepIndent: 2 });
        linesToDisplay = reduced.lines;
        isReduced = reduced.reduced;
        removedIndentByLine = (reduced as any).removedIndentByLine ?? null;
      }

      const displayText = linesToDisplay.join("\n");
      const lang = guessLangFromPath(path);

      let html = await codeToHtml(displayText, {
        lang,
        theme: "github-dark",
      });

      // Keep Shiki's span layout stable for our CSS counter rules.
      html = stripShikiPreNewlines(html);

      // Adjust line numbers and gray out non-focused lines.
      if (useLineFilter && target) {
        const counterStart = slice.start > 0 ? slice.start - 1 : 0;
        html = applyLineNumberCounterReset(html, counterStart);

        const focusStartFile = Math.max(slice.start, target.start);
        const focusEndFile = Math.min(slice.end, target.end);

        if (focusEndFile >= focusStartFile) {
          const focusStartIndex = focusStartFile - slice.start + 1;
          const focusEndIndex = focusEndFile - slice.start + 1;
          html = markNonFocusLines(html, focusStartIndex, focusEndIndex);
        }
      }

      // NEW: fetch and apply flow overlay decorations for the selection.
      if (target) {
        try {
          const res = await fetch("/api/analysis/focus/overlay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path,
              sliceStartLine: slice.start,
              sliceEndLine: slice.end,
              focusStartLine: target.start,
              focusEndLine: target.end,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { tokens: OverlayToken[] };
            if (Array.isArray(data?.tokens) && data.tokens.length) {
              html = applyFlowDecorations(html, data.tokens, {
                sliceStartLine: slice.start,
                removedIndentByLine,
              });
            }
          }
        } catch {
          // Overlay failures should never block showing syntax-highlighted code.
        }
      }

      if (currentProcessId === lastProcessId) {
        setHighlightedHtml(html);
        setDisplayStartLine(slice.start);
        setDisplayEndLine(slice.end);
        setWasIndentationReduced(isReduced);
      }
    })();
  });

  return {
    highlightedHtml,
    displayStartLine,
    displayEndLine,
    wasIndentationReduced,
  };
}
