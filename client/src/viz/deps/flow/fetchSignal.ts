import { createEffect, createSignal, on } from "solid-js";

/**
 * A fetch keyed by `source`, kept in plain signals. Unlike `createResource`,
 * reading it never suspends: the graph view sits under the treemap's
 * Suspense, which would swap the whole view for its fallback.
 */
export function createFetch<S, T>(source: () => S | null | undefined, fetcher: (key: S) => Promise<T>) {
  const [value, setValue] = createSignal<T | undefined>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  let token = 0;
  createEffect(
    on(source, (key) => {
      const mine = ++token;
      setError(null);
      if (key === null || key === undefined) {
        setValue(undefined);
        setLoading(false);
        return;
      }
      setLoading(true);
      fetcher(key).then(
        (v) => {
          if (mine !== token) return;
          setValue(() => v);
          setLoading(false);
        },
        (e) => {
          if (mine !== token) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        },
      );
    }),
  );
  return { value, loading, error };
}
