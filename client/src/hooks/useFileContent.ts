import { createEffect, createSignal, onCleanup } from "solid-js";
import { fetchFileContent } from "../services/fileContent";

export function useFileContent(args: {
  isOpen: () => boolean;
  filePath: () => string | null;
  fetchImpl?: typeof fetch;
}) {
  const [rawCode, setRawCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [totalLines, setTotalLines] = createSignal<number | null>(null);
  const [reloadKey, setReloadKey] = createSignal(0);

  const reload = () => setReloadKey((k) => k + 1);

  createEffect(() => {
    // Depend on reloadKey so callers can force a refetch.
    reloadKey();

    if (!args.isOpen() || !args.filePath()) {
      setRawCode("");
      setError(null);
      setLoading(false);
      setTotalLines(null);
      return;
    }

    const path = args.filePath()!;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setRawCode("");
    setTotalLines(null);

    (async () => {
      try {
        const text = await fetchFileContent({
          path,
          fetchImpl: args.fetchImpl,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setRawCode(text);
        setTotalLines(text.split(/\r?\n/).length);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setError((e as Error).message ?? String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    onCleanup(() => controller.abort());
  });

  return { rawCode, loading, error, totalLines, reload };
}


