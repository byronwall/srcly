// React and the query library are not installed here: the engine knows them by the module their imports name.
import { useMutation, useQuery } from "@tanstack/react-query";

// A query's result is an object of fields. Only `data` holds the fetched
// value: what `queryFn` returns, or what `select` makes of it. `isLoading`,
// `status` and `error` say how the fetch went and never carry that value.
export function Selected(props: { secret: string; title: string }) {
  // `select` reads only `title`: the secret stops at its parameter.
  // @trace selected-title forward props.title @trace selected-secret forward props.secret @stop selected-secret untraced value "raw"
  const note = useQuery({ queryKey: ["note"], queryFn: async () => ({ secret: props.secret, title: props.title }), select: (raw) => raw.title });
  return (
    <div>
      <b>{note.data}</b> {/* @reaches selected-title render-terminal @never-reaches selected-secret */}
      <i>{note.status}</i> {/* @never-reaches selected-title,selected-secret render-terminal */}
      <u>{String(note.isLoading)}</u> {/* @never-reaches selected-title,selected-secret render-terminal */}
    </div>
  );
}

export function Plain(props: { token: string }) {
  // @trace plain-token forward props.token
  const token = useQuery({ queryKey: ["token"], queryFn: () => Promise.resolve(props.token) });
  return (
    <div>
      <b>{token.data}</b> {/* @reaches plain-token render-terminal */}
      <i>{String(token.isPending)}</i> {/* @never-reaches plain-token render-terminal */}
      <u>{String(token.error)}</u> {/* @never-reaches plain-token render-terminal */}
    </div>
  );
}

// A mutation's `data` is what its `mutationFn` returns once a call settles;
// `isPending` is not. `mutate` itself still has no value.
export function Saved(props: { draft: string }) {
  const save = useMutation({ mutationFn: async (text: string) => ({ saved: text }) });
  // @trace saved-draft forward props.draft
  const none = save.mutate(props.draft);
  return (
    <div>
      <b>{save.data?.saved}</b> {/* @reaches saved-draft render-terminal */}
      <i>{String(save.isPending)}</i> {/* @never-reaches saved-draft render-terminal */}
      <u>{String(none)}</u> {/* @never-reaches saved-draft */}
    </div>
  );
}
