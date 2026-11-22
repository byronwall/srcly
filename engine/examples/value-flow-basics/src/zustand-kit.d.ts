// zustand and immer as their packages' declarations shape them, cut down: a
// store's creator is a `StateCreator`, middleware takes one and hands one back,
// and immer's `set` hands its updater a `Draft`. No bodies to read.
declare module "zustand" {
  export type StoreApi<T> = { getState: () => T; setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void; subscribe: (listener: (state: T) => void) => () => void };
  export type StateCreator<T, S = StoreApi<T>["setState"], U = T> = (setState: S, getState: () => T, store: StoreApi<T>) => U;
  export type UseBoundStore<T> = { (): T; <U>(selector: (state: T) => U): U } & StoreApi<T>;
  export function create<T>(initializer: StateCreator<T>): UseBoundStore<T>;
  export function create<T>(): (initializer: StateCreator<T>) => UseBoundStore<T>;
}

declare module "zustand/middleware" {
  import type { StateCreator } from "zustand";
  export function persist<T>(initializer: StateCreator<T>, options: { name: string }): StateCreator<T>;
}

declare module "immer" {
  export type Draft<T> = { -readonly [K in keyof T]: T[K] };
}

declare module "zustand/middleware/immer" {
  import type { StateCreator } from "zustand";
  import type { Draft } from "immer";
  export function immer<T>(initializer: StateCreator<T, (updater: Partial<T> | ((draft: Draft<T>) => void)) => void>): StateCreator<T>;
}
