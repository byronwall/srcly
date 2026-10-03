import { createEffect, createSignal, onCleanup } from "solid-js";
import { guessLangFromPath } from "../utils/guessLangFromPath";

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
  const [displayStartLine, setDisplayStartLine] = createSignal<number | null>(null);
  const [displayEndLine, setDisplayEndLine] = createSignal<number | null>(null);
  const [wasIndentationReduced, setWasIndentationReduced] = createSignal(false);
  const [highlightError, setHighlightError] = createSignal<string | null>(null);
  let worker: Worker | undefined;
  let requestId = 0;

  const getWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL("../workers/highlight.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<{
      id: number;
      html?: string;
      start?: number;
      end?: number;
      wasIndentationReduced?: boolean;
      error?: string;
    }>) => {
      const result = event.data;
      if (result.id !== requestId) return;
      if (result.error) {
        setHighlightError(`Could not highlight this file: ${result.error}`);
        setHighlightedHtml("");
        return;
      }
      setHighlightError(null);
      setHighlightedHtml(result.html ?? "");
      setDisplayStartLine(result.start ?? null);
      setDisplayEndLine(result.end ?? null);
      setWasIndentationReduced(Boolean(result.wasIndentationReduced));
    };
    worker.onerror = (event) => {
      requestId++;
      worker?.terminate();
      worker = undefined;
      setHighlightError(`Syntax highlighting failed: ${event.message}`);
      setHighlightedHtml("");
    };
    return worker;
  };

  createEffect(() => {
    const text = args.rawCode();
    const path = args.filePath();
    const useLineFilter = args.lineFilterEnabled();
    const offset = args.lineOffset();
    const shouldReduceIndent = args.reduceIndentation();
    const tStart = args.targetStart();
    const tEnd = args.targetEnd();
    const id = ++requestId;
    setHighlightError(null);

    if (!text || !path) {
      setHighlightedHtml("");
      setDisplayStartLine(null);
      setDisplayEndLine(null);
      setWasIndentationReduced(false);
      return;
    }

    const target =
      typeof tStart === "number" && typeof tEnd === "number"
        ? { start: tStart, end: tEnd }
        : null;

    try {
      getWorker().postMessage({
        id,
        text,
        language: guessLangFromPath(path),
        useLineFilter,
        offset,
        target,
        reduceIndentation: shouldReduceIndent,
      });
    } catch (error) {
      setHighlightError(`Could not start syntax highlighting: ${String(error)}`);
    }
  });

  onCleanup(() => {
    requestId++;
    worker?.terminate();
  });

  return {
    highlightedHtml,
    displayStartLine,
    displayEndLine,
    wasIndentationReduced,
    highlightError,
  };
}
