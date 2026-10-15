import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine-oniguruma.mjs";
import { computeDisplaySlice } from "../utils/lineRange";
import { reduceCommonIndent } from "../utils/indentation";
import {
  applyLineNumberCounterReset,
  markNonFocusLines,
  stripShikiPreNewlines,
} from "../utils/shikiHtml";

type HighlightMessage = {
  id: number;
  text: string;
  language: string;
  useLineFilter: boolean;
  offset: number;
  target: { start: number; end: number } | null;
  reduceIndentation: boolean;
};

type LanguageModule = { default: unknown };
type LanguageConfig = { shikiName: string; load: () => Promise<LanguageModule> };
const languages: Record<string, LanguageConfig> = {
  ts: { shikiName: "typescript", load: () => import("shiki/langs/typescript.mjs") },
  tsx: { shikiName: "tsx", load: () => import("shiki/langs/tsx.mjs") },
  jsx: { shikiName: "jsx", load: () => import("shiki/langs/jsx.mjs") },
  js: { shikiName: "javascript", load: () => import("shiki/langs/javascript.mjs") },
  json: { shikiName: "json", load: () => import("shiki/langs/json.mjs") },
  python: { shikiName: "python", load: () => import("shiki/langs/python.mjs") },
  md: { shikiName: "markdown", load: () => import("shiki/langs/markdown.mjs") },
  html: { shikiName: "html", load: () => import("shiki/langs/html.mjs") },
  css: { shikiName: "css", load: () => import("shiki/langs/css.mjs") },
  yaml: { shikiName: "yaml", load: () => import("shiki/langs/yaml.mjs") },
  toml: { shikiName: "toml", load: () => import("shiki/langs/toml.mjs") },
  bash: { shikiName: "bash", load: () => import("shiki/langs/bash.mjs") },
};

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
const loadedLanguages = new Set<string>();
const loadingLanguages = new Map<string, Promise<void>>();
const queued: HighlightMessage[] = [];
let isWorking = false;

function getHighlighter() {
  highlighterPromise ??= import("shiki/themes/github-light.mjs").then((theme) =>
    createHighlighterCore({
      langs: [],
      themes: [theme.default],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    })
  );
  return highlighterPromise;
}

async function ensureLanguage(
  language: string,
  highlighter: Awaited<ReturnType<typeof getHighlighter>>
) {
  const config = languages[language];
  if (!config || loadedLanguages.has(language)) return config?.shikiName ?? "text";
  let pending = loadingLanguages.get(language);
  if (!pending) {
    pending = config.load().then((module) => highlighter.loadLanguage(module.default as any));
    loadingLanguages.set(language, pending);
  }
  await pending;
  loadingLanguages.delete(language);
  loadedLanguages.add(language);
  return config.shikiName;
}

async function render(message: HighlightMessage) {
  const slice = computeDisplaySlice({
    text: message.text,
    useLineFilter: message.useLineFilter,
    target: message.target,
    offset: message.offset,
  });
  let lines = slice.linesToDisplay;
  let wasIndentationReduced = false;
  if (message.reduceIndentation) {
    const reduced = reduceCommonIndent(lines, { keepIndent: 2 });
    lines = reduced.lines;
    wasIndentationReduced = reduced.reduced;
  }

  const highlighter = await getHighlighter();
  const language = await ensureLanguage(message.language, highlighter);
  let html = highlighter.codeToHtml(lines.join("\n"), {
    lang: language as any,
    theme: "github-light",
  });
  html = stripShikiPreNewlines(html);
  if (message.useLineFilter && message.target) {
    html = applyLineNumberCounterReset(html, Math.max(0, slice.start - 1));
    const focusStartFile = Math.max(slice.start, message.target.start);
    const focusEndFile = Math.min(slice.end, message.target.end);
    if (focusEndFile >= focusStartFile) {
      html = markNonFocusLines(
        html,
        focusStartFile - slice.start + 1,
        focusEndFile - slice.start + 1
      );
    }
  }

  return {
    id: message.id,
    html,
    start: slice.start,
    end: slice.end,
    wasIndentationReduced,
  };
}

async function processQueue() {
  if (isWorking) return;
  isWorking = true;
  while (queued.length) {
    const message = queued.shift()!;
    try {
      self.postMessage(await render(message));
    } catch (error) {
      self.postMessage({ id: message.id, error: String(error) });
    }
  }
  isWorking = false;
}

self.onmessage = (event: MessageEvent<HighlightMessage>) => {
  // Keep only the newest pending selection while an earlier highlight finishes.
  queued.length = 0;
  queued.push(event.data);
  void processQueue();
};
