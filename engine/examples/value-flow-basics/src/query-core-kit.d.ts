// The query cache's client as @tanstack/query-core declares it, cut down: a
// class whose methods have no bodies to read. Only this package is declared,
// so the other fixtures' `@tanstack/react-query` imports stay untyped.
declare module "@tanstack/query-core" {
  export type QueryKey = readonly unknown[];
  export class QueryClient {
    getQueryData<T = unknown>(queryKey: QueryKey): T | undefined;
    setQueryData<T = unknown>(queryKey: QueryKey, updater: T | ((old: T | undefined) => T)): T | undefined;
    invalidateQueries(filters?: { queryKey?: QueryKey }): Promise<void>;
    isFetching(filters?: { queryKey?: QueryKey }): number;
  }
}
