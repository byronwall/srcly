import A, { Store } from "./m";
import * as m from "./m";

declare function pick<T>(): T;
declare function C<T>(props: { row?: T }): null;

export const value = pick<typeof import("./m").Row>();
export let typed: import("./m").Row | undefined;
export const tag = <C<import("./m").Row> />;

export function run(store: Store, loose: any) {
  store.bump();
  loose.bump();
  const made = new m.Store();
  const n: A = A();
  return { made, n };
}

export function outer() {
  function inner(): Local {
    return { ok: true };
  }
  type Local = { ok: boolean };
  return inner;
}
