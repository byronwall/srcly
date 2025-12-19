import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { FlowTooltip } from "./FlowTooltip";

function cssEscape(value: string) {
  // CSS.escape is widely supported in modern browsers; provide a tiny fallback.
  const esc = (globalThis as any).CSS?.escape;
  return typeof esc === "function" ? esc(value) : value.replace(/"/g, '\\"');
}

export function FlowOverlayCode(props: { html: () => string }) {
  let containerRef: HTMLDivElement | undefined;

  const [hoveredSym, setHoveredSym] = createSignal<string | null>(null);
  const [pinnedSym, setPinnedSym] = createSignal<string | null>(null);
  const [tooltipText, setTooltipText] = createSignal("");
  const [tooltipPos, setTooltipPos] = createSignal({ x: 0, y: 0 });

  const clearHover = () => {
    setHoveredSym(null);
    if (!pinnedSym()) setTooltipText("");
    if (!containerRef) return;
    containerRef.querySelectorAll(".flow-hovered").forEach((el) =>
      el.classList.remove("flow-hovered")
    );
  };

  const clearPin = () => {
    setPinnedSym(null);
    setTooltipText("");
    if (!containerRef) return;
    containerRef.querySelectorAll(".flow-pinned").forEach((el) =>
      el.classList.remove("flow-pinned")
    );
  };

  const highlightAll = (symId: string, className: string) => {
    if (!containerRef) return;
    const sel = `[data-sym="${cssEscape(symId)}"]`;
    containerRef.querySelectorAll(sel).forEach((el) => el.classList.add(className));
  };

  const removeAll = (className: string) => {
    if (!containerRef) return;
    containerRef.querySelectorAll(`.${className}`).forEach((el) => el.classList.remove(className));
  };

  const setTooltipFromEl = (el: HTMLElement, x: number, y: number) => {
    setTooltipPos({ x: x + 12, y: y + 12 });
    setTooltipText(el.dataset.tip || "");
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

  const onPointerMove = (e: PointerEvent) => {
    if (!containerRef) return;
    if (pinnedSym()) {
      // Keep tooltip positioned near the cursor, but don't change selection.
      if (tooltipText()) setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });
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
    if (!containerRef) return;
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
        innerHTML={props.html() || ""}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />

      {/* Important: keep Solid-managed children OUTSIDE the innerHTML container */}
      <FlowTooltip
        isOpen={() => !!tooltipText()}
        x={() => tooltipPos().x}
        y={() => tooltipPos().y}
        text={tooltipText}
      />
    </div>
  );
}


