// React and the query library are not installed here: the engine knows them by the module their imports name.
import { useQuery } from "@tanstack/react-query";

// `const { data } = value` binds one field of the value, as `value.data`
// would. A field path follows it both ways: a binding of another field
// never holds what the value's `data` holds.
export function Destructured(props: { token: string }) {
  // @trace destructured-token forward props.token @outcome destructured-token ok
  const { data, status } = useQuery({ queryKey: ["token"], queryFn: () => Promise.resolve(props.token) });
  return (
    <div>
      <b>{data}</b> {/* @reaches destructured-token render-terminal */}
      <i>{status}</i> {/* @never-reaches destructured-token */}
    </div>
  );
}

// Backward, a read of the bound field (`rows.length`) walks into the field
// the binding names, so the fetched body is found behind it.
export function Rows() {
  const { data: rows } = useQuery({ queryKey: ["rows"], queryFn: () => fetch("/api/rows").then((r) => r.json() as Promise<string[]>) }); // @reaches rows-length fetch-input @path rows-length "r.json()" "rows"
  return <b>{rows?.length}</b>; // @trace rows-length backward rows?.length @outcome rows-length ok
}

// A binding of another field starts where the library fills it: not at the fetch.
export function Pending() {
  const { isPending } = useQuery({ queryKey: ["pending"], queryFn: () => fetch("/api/pending") }); // @never-reaches pending-flag fetch-input
  return <b>{String(isPending)}</b>; // @trace pending-flag backward isPending @stop pending-flag untraced value
}
