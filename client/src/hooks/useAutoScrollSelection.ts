import { createEffect, createSignal } from "solid-js";

export function useAutoScrollSelection(args: {
  isOpen: () => boolean;
  viewMode: () => "code" | "preview";
  hasSelection: () => boolean;
  loading: () => boolean;
  contentContainerEl: () => HTMLElement | undefined;
  contentKey: () => unknown;
}) {
  const [hasAutoScrolled, setHasAutoScrolled] = createSignal(false);

  const resetAutoScroll = () => setHasAutoScrolled(false);

  createEffect(() => {
    // Re-trigger after content changes + re-render.
    args.contentKey();

    const isOpen = args.isOpen();
    const mode = args.viewMode();
    const hasSelection = args.hasSelection();
    const loading = args.loading();

    if (!isOpen || mode !== "preview" || !hasSelection || loading) {
      setHasAutoScrolled(false);
      return;
    }

    if (hasAutoScrolled()) return;

    queueMicrotask(() => {
      const container = args.contentContainerEl();
      if (!container) return;

      const target = container.querySelector(
        ".md-selected-range"
      ) as HTMLElement | null;
      if (!target) return;

      setHasAutoScrolled(true);
      target.scrollIntoView({ block: "center" });
    });
  });

  return { resetAutoScroll };
}


