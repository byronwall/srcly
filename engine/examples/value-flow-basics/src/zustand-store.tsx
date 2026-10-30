// A zustand store (a `store` row): what its function returns and what its
// `set` receives are the store, a selector reads it, and calling a member
// read through the hook (`setCount` after `useStore((s) => s.setCount)`) runs
// the store's own function, never the selector. Two stores never mix.
import { create } from "zustand";

const useCounter = create<{ count: number; setCount: (n: number) => void }>((set) => ({ count: 0, setCount: (n) => set({ count: n }) }));
const useOther = create<{ label: string }>(() => ({ label: "other" }));

export function Counter(props: { n: number }) {
  const count = useCounter((s) => s.count);
  const setCount = useCounter((s) => s.setCount);
  const label = useOther((s) => s.label); // @never-reaches store-set
  return <button onClick={() => setCount(props.n)}>{count}{label}</button>; // @trace store-set forward props.n @outcome store-set ok @reaches store-set render-terminal "count" @reaches store-set return
}
