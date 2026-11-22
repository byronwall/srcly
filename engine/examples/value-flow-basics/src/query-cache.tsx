// React and the query library are not installed here: the engine knows them by the module their imports name.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import "./query-core-kit";

// The query cache lives outside the program's values. Its client's methods
// are rows (`QueryClient.*`, found by the class the checker resolves): a
// read yields what the cache holds, a write or an invalidation changes it.
export function Invalidate(props: { listId: string }) {
  const client: QueryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (title: string) => fetch("/api/items", { method: "POST", body: title }),
    // @trace invalidated forward props.listId @outcome invalidated ok
    onSettled: () => client.invalidateQueries({ queryKey: ["items", props.listId] }), // @reaches invalidated external-effect @reaches invalidated return
  });
  return <button onClick={() => add.mutate("new")}>add</button>;
}

const LIKES = "likes";

// What `onMutate` reads from the cache comes back to `onError` as its context: an external read, never the key.
export function Optimistic(props: { postId: string }) {
  const client: QueryClient = useQueryClient(); // @reaches cache-read external-read "read: useQueryClient(…)"
  const like = useMutation({
    mutationFn: (id: string) => fetch(`/api/like/${id}`, { method: "POST" }),
    onMutate: (id) => ({ previous: client.getQueryData<number>([LIKES, id]) }), // @reaches cache-read external-read "read: client.getQueryData(…)" @path cache-read "client.getQueryData<number>([LIKES, id])" "context?.previous"
    onError: (_error, _id, context) => console.log(context?.previous), // @trace cache-read backward context?.previous @outcome cache-read ok
  });
  return <button onClick={() => like.mutate(props.postId)}>like</button>;
}

// A cache write keeps the value for the key; nothing in the program reads it back from the write.
export function Saved(props: { name: string }) {
  const client: QueryClient = useQueryClient();
  // @trace cache-write forward props.name @outcome cache-write ok
  return <button onClick={() => client.setQueryData(["name"], props.name)}>save</button>; // @reaches cache-write external-effect @reaches cache-write return
}

// A client method no row names is no cache boundary: `isFetching` is neither a read nor a write the rows claim.
export function Unmodelled(props: { listId: string }) {
  const client: QueryClient = useQueryClient();
  // @trace unmodelled forward props.listId @outcome unmodelled ok
  return <b>{client.isFetching({ queryKey: ["items", props.listId] })}</b>; // @reaches unmodelled render-terminal @never-reaches unmodelled external-effect
}
