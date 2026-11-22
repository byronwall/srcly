// React and the query library are not installed here: the engine knows them by the module their imports name.
import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";

// A hook's row says what its result holds. An argument the row does not name
// is not in the result: the hook keeps it, and the value ends there.
export function Memo(props: { shown: string; dep: string }) {
  // @trace memo-shown forward props.shown @trace memo-dep forward props.dep @outcome memo-shown,memo-dep ok
  const label = useMemo(() => props.shown.trim(), [props.dep]); // @reaches memo-dep object-pack "[props.dep]"
  return <b>{label}</b>; // @reaches memo-shown render-terminal @never-reaches memo-dep
}

// A query's key reaches its `queryFn` as the `queryKey` of the object the hook
// hands it, and reaches `data` only through what the `queryFn` does with it.
export function Keyed(props: { id: string; stale: number }) {
  const user = useQuery({ // @reaches key-id,key-stale object-pack
    queryKey: ["user", props.id], // @trace key-id forward props.id @outcome key-id ok
    queryFn: ({ queryKey }) => fetch(`/api/users/${queryKey[1]}`), // @reaches key-id external-effect @stop key-id network fetch-input @path key-id "props.id" "queryKey[1]"
    staleTime: props.stale, // @trace key-stale forward props.stale @outcome key-stale ok
  }); // Both end at the options object too: the hook keeps it.
  return <b>{String(user.data)}</b>; // @reaches key-id render-terminal @never-reaches key-stale
}

// A `queryFn` that does not read `queryKey` never sees the key.
export function Unkeyed(props: { id: string }) {
  const all = useQuery({ // @reaches unkeyed-id object-pack
    queryKey: ["all", props.id], // @trace unkeyed-id forward props.id @outcome unkeyed-id ok
    queryFn: ({ signal }) => fetch("/api/all", { signal }), // @never-reaches unkeyed-id
  });
  return <b>{String(all.data)}</b>; // @never-reaches unkeyed-id
}

// What `getNextPageParam` returns is the next call's `pageParam`.
export function Paged() {
  const feed = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: (context) => fetch(`/api/feed?cursor=${context.pageParam}`).then((r) => r.json() as Promise<{ next: number }>), // @reaches paged-next external-effect @stop paged-next network fetch-input
    getNextPageParam: (last) => last.next, // @trace paged-next forward last.next @path paged-next "last.next" "pageParam"
  });
  return <b>{String(feed.data)}</b>; // @reaches paged-next render-terminal
}

// A mutation's variables reach `onMutate`, `onSuccess` and `onError`. What
// `mutationFn` returns is `onSuccess`'s first parameter, and what `onMutate`
// returns is the context. An error is none of them.
export function Renamed(props: { name: string }) {
  const rename = useMutation({
    mutationFn: async (input: { name: string }) => ({ size: input.name.length }),
    onMutate: (input) => ({ before: input.name }),
    onSuccess: (saved, input, context) => {
      console.log(saved.size); // @reaches renamed-name stdout @reaches renamed-name external-effect @path renamed-name "{ size: input.name.length }" "console.log(saved.size)"
      console.info(input.name); // @reaches renamed-name stdout @reaches renamed-name external-effect
      console.warn(context?.before); // @reaches renamed-name stdout @reaches renamed-name external-effect @path renamed-name "{ before: input.name }" "console.warn(context?.before)" @no-path renamed-name "{ before: input.name }" "console.log(saved.size)"
    },
    onError: (error) => {
      console.error(error); // @never-reaches renamed-name
    },
  });
  // @trace renamed-name forward props.name @outcome renamed-name ok
  return <button onClick={() => rename.mutate({ name: props.name })}>rename</button>;
}
