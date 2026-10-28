/**
 * What a framework call does with the functions and values it is given:
 * `returns` the call's value is what its callback (at that argument) returns;
 * `passes` the call's value carries those arguments (`*` every one);
 * `source` and `callback` the callback's first parameter receives what the
 * source returns (or is). An accessor a `returns` factory makes yields that
 * value when called.
 */
export type FrameworkFlow = { returns?: number; passes?: number[] | "*"; source?: number; callback?: number };
export const FRAMEWORK_FLOWS: Record<string, Record<string, FrameworkFlow>> = {
  "solid-js": {
    createMemo: { returns: 0 }, children: { returns: 0 }, untrack: { returns: 0 }, batch: { returns: 0 },
    on: { source: 0, callback: 1, returns: 1 }, splitProps: { passes: [0] }, mergeProps: { passes: "*" },
    // An effect runs its callback for what it does; the call's own value is unused, so a value ends there.
    createEffect: { returns: 0 }, createRenderEffect: { returns: 0 }, createComputed: { returns: 0 }, onMount: { returns: 0 }, onCleanup: { returns: 0 },
  },
  "solid-js/store": { unwrap: { passes: [0] }, createMutable: { passes: [0] } },
  "@solidjs/router": { createAsync: { returns: 0 }, createAsyncStore: { returns: 0 } },
  "react": { useMemo: { returns: 0 }, useDeferredValue: { passes: [0] }, useEffect: { returns: 0 }, useLayoutEffect: { returns: 0 } },
};
export const ACCESSOR_FACTORIES = new Set(["solid-js#createMemo", "solid-js#children", "@solidjs/router#createAsync", "@solidjs/router#createAsyncStore"]);

/**
 * Data libraries that take their functions in an options object: a query's
 * value is what its `queryFn` returns; a mutation's `mutate(x)` calls its
 * `mutationFn` with `x`. By module, the hook names and the option they read.
 */
export const OPTION_FLOWS: Record<string, Record<string, "queryFn" | "mutationFn">> = {
  "@tanstack/react-query": { useQuery: "queryFn", useSuspenseQuery: "queryFn", useInfiniteQuery: "queryFn", useMutation: "mutationFn" },
  "@tanstack/solid-query": { createQuery: "queryFn", createInfiniteQuery: "queryFn", createMutation: "mutationFn", useQuery: "queryFn", useMutation: "mutationFn" },
};
