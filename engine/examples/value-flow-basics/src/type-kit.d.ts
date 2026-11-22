// A package with no row and no source: only its generic signatures say what moves (`type-signature`, assumed).
declare module "type-kit" {
  export function memoize<T>(compute: () => T, deps: unknown[]): T;
  export interface Slot<T> {
    readonly fallback: T;
  }
  export function makeSlot<T>(fallback: T): Slot<T>;
  export function readSlot<T>(slot: Slot<T>): T;
  export function keepFn(fn: () => string): () => string;
}
