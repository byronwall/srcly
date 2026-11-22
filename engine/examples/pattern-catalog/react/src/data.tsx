import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryFunctionContext } from "@tanstack/react-query";
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createPost } from "./actions";

// Data libraries of a real React application: React Query, zustand and Next.

// R58 a queryKey value reaches the queryFn through its context
function fetchUser({ queryKey }: QueryFunctionContext<readonly [string, string]>) {
  return fetch(`/api/users/${queryKey[1]}`).then((r) => r.json() as Promise<{ name: string }>);
}
export function UserName(props: { id: string }) { // @trace q-key-to-fn forward props.id @want external-effect
  const { data } = useQuery({ queryKey: ["user", props.id] as const, queryFn: fetchUser });
  return <p>{data?.name}</p>;
}

// R59 a queryFn that closes over a prop, with `enabled`
export function UserPosts(props: { id: string }) { // @trace q-closure forward props.id @want external-effect
  const posts = useQuery({ queryKey: ["posts", props.id], queryFn: () => fetch(`/api/posts?user=${props.id}`).then((r) => r.json() as Promise<string[]>), enabled: props.id !== "" });
  return <ul>{posts.data?.map((p) => <li key={p}>{p}</li>)}</ul>;
}

// R60 `select` narrows the fetched rows
export function TodoCount() {
  const { data } = useQuery({ queryKey: ["todos"], queryFn: () => fetch("/api/todos").then((r) => r.json() as Promise<{ id: string; title: string }[]>), select: (rows) => rows.map((row) => row.title) });
  return <ul>{data?.map((title) => <li key={title}>{title}</li>)}</ul>; // @trace q-select backward data?.map((title) => <li key={title}>{title}</li>) @want fetch-input
}

// R61 useInfiniteQuery: pages to render, and the next cursor to the next fetch
export function Feed() {
  const feed = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam = 0 }) => fetch(`/api/feed?cursor=${pageParam}`).then((r) => r.json() as Promise<{ items: string[]; next: number }>),
    getNextPageParam: (last) => last.next, // @trace q-next-page forward last.next @want external-effect
  });
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>; // @trace q-infinite backward items.map((item) => <li key={item}>{item}</li>) @want fetch-input
}

// R62 `mutate` variables reach `onSuccess`, which writes the cache
export function Rename(props: { id: string; name: string }) {
  const client = useQueryClient();
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) => fetch(`/api/users/${input.id}`, { method: "PATCH", body: input.name }).then((r) => r.json() as Promise<{ name: string }>),
    onSuccess: (saved, input) => {
      client.setQueryData(["user", input.id], saved);
      console.log(input.name);
    },
  });
  return <button onClick={() => rename.mutate({ id: props.id, name: props.name })}>rename</button>; // @trace q-mutate-success forward props.name @want stdout
}

// R63 an optimistic update: what `onMutate` returns is the context of `onError`
export function Like(props: { postId: string }) {
  const client = useQueryClient();
  const like = useMutation({
    mutationFn: (id: string) => fetch(`/api/like/${id}`, { method: "POST" }),
    onMutate: (id) => {
      const previous = client.getQueryData<number>(["likes", id]);
      client.setQueryData(["likes", id], (previous ?? 0) + 1);
      return { previous };
    },
    onError: (_error, id, context) => {
      client.setQueryData(["likes", id], context?.previous); // @trace q-optimistic backward context?.previous @want external-read
    },
  });
  return <button onClick={() => like.mutate(props.postId)}>like</button>;
}

// R64 invalidateQueries after a mutation
export function AddItem(props: { listId: string }) { // @trace q-invalidate forward props.listId @want external-effect
  const client = useQueryClient();
  const add = useMutation({
    mutationFn: (title: string) => fetch("/api/items", { method: "POST", body: title }),
    onSettled: () => client.invalidateQueries({ queryKey: ["items", props.listId] }),
  });
  return <button onClick={() => add.mutate("new")}>add</button>;
}

// R65 a persisted zustand store
type BearState = { bears: number; add: (by: number) => void };
const useBears = create<BearState>()(persist((set) => ({ bears: 0, add: (by) => set((state) => ({ bears: state.bears + by })) }), { name: "bears" }));
export function Bears(props: { by: number }) { // @trace z-persist forward props.by @want render-terminal
  const bears = useBears((state) => state.bears);
  const add = useBears((state) => state.add);
  return <button onClick={() => add(props.by)}>{bears}</button>;
}

// R66 an immer zustand store: `set` changes a draft
type NoteState = { notes: string[]; addNote: (note: string) => void };
const useNotes = create<NoteState>()(immer((set) => ({
  notes: [],
  addNote: (note) => set((draft) => {
    draft.notes.push(note);
  }),
})));
export function Notes(props: { note: string }) { // @trace z-immer forward props.note @want render-terminal
  const notes = useNotes((state) => state.notes);
  const addNote = useNotes((state) => state.addNote);
  return <ul onClick={() => addNote(props.note)}>{notes.map((note) => <li key={note}>{note}</li>)}</ul>;
}

// R67 a store made of slices; read whole, and used outside React
type FishSlice = { fishes: number; addFish: (count: number) => void };
type OwnerSlice = { owner: string; rename: (owner: string) => void };
const fishSlice: StateCreator<FishSlice & OwnerSlice, [], [], FishSlice> = (set) => ({ fishes: 0, addFish: (count) => set((state) => ({ fishes: state.fishes + count })) });
const ownerSlice: StateCreator<FishSlice & OwnerSlice, [], [], OwnerSlice> = (set) => ({ owner: "", rename: (owner) => set({ owner }) });
const usePond = create<FishSlice & OwnerSlice>()((...a) => ({ ...fishSlice(...a), ...ownerSlice(...a) }));
export function Pond(props: { count: number }) { // @trace z-slices forward props.count @want render-terminal
  const { fishes, addFish } = usePond();
  return <button onClick={() => addFish(props.count)}>{fishes}</button>;
}
export function Owner() {
  const owner = usePond((state) => state.owner);
  return <b>{owner}</b>;
}
export function renameOwner(next: string) { // @trace z-get-state forward next @want render-terminal
  usePond.getState().rename(next);
}
export function resetOwner(next: string) { // @trace z-set-state forward next @want render-terminal
  usePond.setState({ owner: next });
}
usePond.subscribe((state) => console.log(state.owner)); // @trace z-subscribe backward state.owner @want parameter

// R68 Next: search params, route params, and router calls
export function TagFilter() {
  const params = useSearchParams();
  const tag = params.get("tag");
  return <p>{tag}</p>; // @trace n-search-params backward tag @want external-read
}
export function PostTitle() {
  const { slug } = useParams<{ slug: string }>();
  return <h1>{slug}</h1>; // @trace n-use-params backward slug @want external-read
}
export function Sorter(props: { sort: string }) { // @trace n-router-replace forward props.sort @want external-effect
  const router = useRouter();
  const params = useSearchParams();
  const apply = () => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", props.sort);
    router.replace(`?${next.toString()}`);
  };
  return <button onClick={apply}>sort</button>;
}

// R69 a server action as a form's action
export function NewPost() {
  return <form action={createPost}><input name="title" /></form>;
}
