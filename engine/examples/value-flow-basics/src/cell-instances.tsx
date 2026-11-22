// Each call of a cell row makes its own state (a `cell` row). Two calls of a
// factory that makes a signal are two signals: what goes into one's setter
// reaches only that one's reads. Two stores built from one slice are two
// stores: a write through the shared slice cannot be pinned to the store
// whose call ran it, so it reaches each store's render, assumed, never ok.
// The packages' declarations: this fixture folder has no node_modules.
import "./zustand-kit";
import { createSignal } from "solid-js";
import { create, type StateCreator } from "zustand";

function makeCounter(start: number) {
  const [count, setCount] = createSignal(start);
  return { set: (next: number) => setCount(next), read: () => count() };
}

export function TwoCounters(props: { a: number; b: number }) {
  const first = makeCounter(0);
  const second = makeCounter(0);
  first.set(props.a); // @trace cell-a forward props.a @outcome cell-a ok
  second.set(props.b); // @trace cell-b forward props.b @outcome cell-b ok
  return (
    <p>
      {/* @reaches cell-a render-terminal @never-reaches cell-b */}
      <span>{first.read()}</span>
      {/* @reaches cell-b render-terminal @never-reaches cell-a */}
      <em>{second.read()}</em>
    </p>
  );
}

type Label = { label: string; relabel: (label: string) => void };
const labelSlice: StateCreator<Label> = (set) => ({ label: "", relabel: (label) => set({ label }) });
const useLeft = create<Label>()((...a) => ({ ...labelSlice(...a) }));
const useRight = create<Label>()((...a) => ({ ...labelSlice(...a) }));

export function Labels(props: { left: string }) {
  const relabel = useLeft((state) => state.relabel);
  relabel(props.left); // @trace shared-slice forward props.left @outcome shared-slice assumed @edge shared-slice framework-flow partial shared-instance @no-edge shared-slice framework-flow partial framework-state
  const left = useLeft((state) => state.label);
  const right = useRight((state) => state.label);
  return (
    <p>
      {/* @reaches shared-slice render-terminal */}
      <span>{left}</span>
      {/* @reaches shared-slice render-terminal */}
      <em>{right}</em>
    </p>
  );
}

// The store's other handles: a creator's `get()` and a subscriber's
// parameter read the store, as `getState()` does.
type Tally = { total: number; add: (n: number) => void; report: () => number };
const useTally = create<Tally>()((set, get) => ({ total: 0, add: (n) => set({ total: n }), report: () => get().total }));
export function tally(n: number) {
  useTally.getState().add(n); // @trace tally forward n @outcome tally ok
  console.log(useTally.getState().report()); // @reaches tally external-effect @reaches tally stdout
  useTally.subscribe((state) => console.log(state.total)); // @reaches tally external-effect @reaches tally stdout
}
