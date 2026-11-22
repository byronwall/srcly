// A zustand store past its plain form (a `store` row): middleware that takes
// and hands back a `StateCreator` (persist, immer) passes the store's
// function through; an immer updater's writes into its draft are the state;
// slices called with the store's own `(set, get, api)` add to it, and their
// members run when read whole; `getState()` reads it and `setState()` writes
// it. The negative: a pass-through the checker does not type as a
// `StateCreator` makes no store, so nothing reaches its render.
// The packages' declarations: this fixture folder has no node_modules.
import "./zustand-kit";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

type Bears = { bears: number; add: (by: number) => void };
const useBears = create<Bears>()(persist((set) => ({ bears: 0, add: (by) => set((state) => ({ bears: state.bears + by })) }), { name: "bears" }));
export function BearCount(props: { by: number }) {
  const bears = useBears((state) => state.bears);
  const add = useBears((state) => state.add);
  return <button onClick={() => add(props.by)}>{bears}</button>; // @trace z-persist forward props.by @outcome z-persist ok @reaches z-persist render-terminal "bears"
}

type Notes = { notes: string[]; addNote: (note: string) => void };
const useNotes = create<Notes>()(immer((set) => ({ notes: [], addNote: (note) => set((draft) => { draft.notes.push(note); }) }))); // @path z-immer "draft" "useNotes"
export function NoteList(props: { note: string }) {
  const notes = useNotes((state) => state.notes);
  const addNote = useNotes((state) => state.addNote);
  return <ul onClick={() => addNote(props.note)}>{notes}</ul>; // @trace z-immer forward props.note @outcome z-immer ok @reaches z-immer render-terminal "notes"
}

type Fish = { fishes: number; addFish: (count: number) => void };
type Owner = { owner: string; rename: (owner: string) => void };
const fishSlice: StateCreator<Fish & Owner, StoreApiSet, Fish> = (set) => ({ fishes: 0, addFish: (count) => set((state) => ({ fishes: state.fishes + count })) });
const ownerSlice: StateCreator<Fish & Owner, StoreApiSet, Owner> = (set) => ({ owner: "", rename: (owner) => set({ owner }) });
type StoreApiSet = (partial: Partial<Fish & Owner> | ((state: Fish & Owner) => Partial<Fish & Owner>)) => void;
const usePond = create<Fish & Owner>()((...a) => ({ ...fishSlice(...a), ...ownerSlice(...a) })); // @edge z-slices framework-flow partial framework-state
export function Pond(props: { count: number }) {
  const { fishes, addFish } = usePond();
  return <button onClick={() => addFish(props.count)}>{fishes}</button>; // @trace z-slices forward props.count @outcome z-slices ok @reaches z-slices render-terminal "fishes" @never-reaches z-get-state,z-set-state
}
export function PondOwner() {
  const owner = usePond((state) => state.owner);
  return <b>{owner}</b>; // @reaches z-get-state,z-set-state render-terminal "owner"
}
export function renameOwner(next: string) {
  usePond.getState().rename(next); // @trace z-get-state forward next @outcome z-get-state ok
}
export function resetOwner(next: string) {
  usePond.setState({ owner: next }); // @trace z-set-state forward next @outcome z-set-state ok
}

const passThrough = <T,>(fn: T): T => fn;
const useWrapped = create<{ label: string; relabel: (label: string) => void }>()(passThrough((set) => ({ label: "", relabel: (label) => set({ label }) })));
export function Wrapped(props: { label: string }) {
  const label = useWrapped((state) => state.label);
  const relabel = useWrapped((state) => state.relabel);
  return <button onClick={() => relabel(props.label)}>{label}</button>; // @trace z-not-creator forward props.label @outcome z-not-creator partial @stop z-not-creator disconnected call @never-reaches z-not-creator render-terminal
}

