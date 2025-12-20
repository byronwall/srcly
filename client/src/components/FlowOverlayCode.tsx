import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { FlowTooltip } from "./FlowTooltip";
import {
  applyFlowDecorationsToEl,
  type OverlayToken,
} from "../utils/flowDecorations";
import { type LineRange } from "../utils/lineRange";

function cssEscape(value: string) {
  // CSS.escape is widely supported in modern browsers; provide a tiny fallback.
  const esc = (globalThis as any).CSS?.escape;
  return typeof esc === "function" ? esc(value) : value.replace(/"/g, '\\"');
}

export function FlowOverlayCode(props: {
  html: () => string;
  filePath?: () => string | null;
  sliceStartLine?: () => number;
  focusRange?: () => LineRange | null;
  removedIndentByLine?: () => number[] | null;
  lineFilterEnabled?: () => boolean;
  dataFlowEnabled?: () => boolean;
}) {
  let containerRef: HTMLDivElement | undefined;

  const [hoveredSym, setHoveredSym] = createSignal<string | null>(null);
  const [pinnedSym, setPinnedSym] = createSignal<string | null>(null);
  const [tooltipData, setTooltipData] = createSignal<{
    text: string;
    snippet?: string;
    defLine?: string;
    scopeSnippet?: string;
    scopeLine?: string;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = createSignal({ x: 0, y: 0 });
  const [overlayTokens, setOverlayTokens] = createSignal<OverlayToken[]>([]);

  const clearHover = () => {
    setHoveredSym(null);
    if (!pinnedSym()) setTooltipData(null);
    if (!containerRef) return;
    containerRef
      .querySelectorAll(".flow-hovered")
      .forEach((el) => el.classList.remove("flow-hovered"));
  };

  const clearPin = () => {
    setPinnedSym(null);
    setTooltipData(null);
    if (!containerRef) return;
    containerRef
      .querySelectorAll(".flow-pinned")
      .forEach((el) => el.classList.remove("flow-pinned"));
  };

  const highlightAll = (symId: string, className: string) => {
    if (!containerRef) return;
    const sel = `[data-sym="${cssEscape(symId)}"]`;
    containerRef
      .querySelectorAll(sel)
      .forEach((el) => el.classList.add(className));
  };

  const removeAll = (className: string) => {
    if (!containerRef) return;
    containerRef
      .querySelectorAll(`.${className}`)
      .forEach((el) => el.classList.remove(className));
  };

  const setTooltipFromEl = (el: HTMLElement, x: number, y: number) => {
    setTooltipPos({ x: x + 12, y: y + 12 });
    setTooltipData({
      text: el.dataset.tip || "",
      snippet: el.dataset.snippet,
      defLine: el.dataset.defLine,
      scopeSnippet: el.dataset.scopeSnippet,
      scopeLine: el.dataset.scopeLine,
    });
  };

  const getFlowEl = (target: EventTarget | null): HTMLElement | null => {
    if (!target || !(target instanceof HTMLElement)) return null;
    return target.closest(".flow") as HTMLElement | null;
  };

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pinnedSym()) {
        e.preventDefault();
        e.stopPropagation();
        clearPin();
        clearHover();
      }
    };

    // Capture phase so we can intercept ESC before CodeModal closes.
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  createEffect(() => {
    // When HTML changes (new file, new selection), clear any previous state.
    // This also prevents stale pinned IDs from sticking around.
    props.html();
    clearPin();
    clearHover();
  });

  createEffect(() => {
    const path = props.filePath?.() ?? null;
    const sliceStart = props.sliceStartLine?.() ?? 1;
    const focus = props.focusRange?.() ?? null;
    const filterEnabled = props.lineFilterEnabled?.() ?? true;
    const flowEnabled = props.dataFlowEnabled?.() ?? true;

    if (!path || !flowEnabled) {
      setOverlayTokens([]);
      return;
    }

    const controller = new AbortController();

    // Default to whole file if no focus range OR if filtering is disabled.
    const fStart = filterEnabled && focus ? focus.start : 1;
    const fEnd = filterEnabled && focus ? focus.end : 1000000;

    // Clear tokens immediately to prevent stale overlays when switching contexts
    setOverlayTokens([]);

    (async () => {
      try {
        const res = await fetch("/api/analysis/focus/overlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            path,
            sliceStartLine: sliceStart,
            sliceEndLine: sliceStart + 10000, // Roughly cover the slice
            focusStartLine: fStart,
            focusEndLine: fEnd,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { tokens: OverlayToken[] };
          setOverlayTokens(data?.tokens || []);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setOverlayTokens([]);
        }
      }
    })();

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    const tokens = overlayTokens();
    const flowEnabled = props.dataFlowEnabled?.() ?? true;
    const html = props.html();
    if (!containerRef) return;

    // Reset to base HTML first to clear any existing decorations.
    // This ensures that if flowEnabled is false or tokens is empty,
    // we revert to the original syntax-highlighted code.
    containerRef.innerHTML = html || "";

    if (!tokens.length || !flowEnabled) return;

    // Apply decorations to the DOM directly.
    applyFlowDecorationsToEl(containerRef, tokens, {
      sliceStartLine: props.sliceStartLine?.() ?? 1,
      removedIndentByLine: props.removedIndentByLine?.() ?? null,
    });
  });

  const onPointerMove = (e: PointerEvent) => {
    if (!containerRef || !(props.dataFlowEnabled?.() ?? true)) return;
    if (pinnedSym()) {
      // Keep tooltip positioned near the cursor, but don't change selection.
      if (tooltipData())
        setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });
      return;
    }

    const el = getFlowEl(e.target);
    if (!el) {
      clearHover();
      return;
    }

    const sym = el.dataset.sym || null;
    if (!sym) {
      clearHover();
      return;
    }

    if (sym !== hoveredSym()) {
      setHoveredSym(sym);
      removeAll("flow-hovered");
      highlightAll(sym, "flow-hovered");
    }

    setTooltipFromEl(el, e.clientX, e.clientY);
  };

  const onPointerLeave = () => {
    if (!pinnedSym()) clearHover();
  };

  const onClick = (e: MouseEvent) => {
    if (!containerRef || !(props.dataFlowEnabled?.() ?? true)) return;
    const el = getFlowEl(e.target);
    if (!el) return;
    const sym = el.dataset.sym || null;
    if (!sym) return;

    e.stopPropagation();

    // Toggle pin if clicking the same symbol again.
    if (pinnedSym() === sym) {
      clearPin();
      return;
    }

    clearPin();
    setPinnedSym(sym);
    removeAll("flow-hovered");
    highlightAll(sym, "flow-pinned");

    // Place tooltip near the click.
    setTooltipFromEl(el, e.clientX, e.clientY);
  };

  return (
    <div class="relative">
      <div
        ref={(el) => (containerRef = el)}
        class="code-modal-content"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />

      {/* Important: keep Solid-managed children OUTSIDE the innerHTML container */}
      <FlowTooltip
        isOpen={() => !!tooltipData()}
        x={() => tooltipPos().x}
        y={() => tooltipPos().y}
        data={tooltipData}
      />
    </div>
  );
}
