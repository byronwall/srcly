// React and the query library are not installed here: the engine knows them by the module their imports name.
import { useEffect, useLayoutEffect } from "react";
import { useMutation } from "@tanstack/react-query";

// An effect's call has no value. Its callback still runs for what it does, so
// its body is walked, but what the callback returns (a cleanup) is not the
// hook's result. `mutate` has no value either; `mutateAsync` yields what the
// `mutationFn` returns. What either is given goes to the `mutationFn`, and
// reaches a result only if that function hands it back.
export function Effects(props: { token: string; dep: string }) {
  const held = useEffect(() => {
    // @trace effect-body forward props.token
    console.log(props.token); // @reaches effect-body stdout @reaches effect-body external-effect
    return () => props.dep; // @trace effect-cleanup forward props.dep @reaches effect-cleanup return @no-path effect-cleanup "props.dep" "held"
  });
  console.log(held); // @never-reaches effect-cleanup
  const layout = useLayoutEffect(() => () => props.token); // @trace layout-cleanup forward props.token @reaches layout-cleanup return
  console.log(layout); // @never-reaches layout-cleanup
}

export function Mutations(props: { first: string; second: string }) {
  const mutation = useMutation({ mutationFn: async (value: string) => ({ saved: value }) }); // @reaches mutate-void return
  // @trace mutate-void forward props.first @no-path mutate-void "props.first" "none" @no-path mutate-void "props.first" "some"
  const none = mutation.mutate(props.first);
  console.log(none); // @never-reaches mutate-void
  // @trace mutate-async both props.second @path mutate-async "props.second" "some"
  const some = mutation.mutateAsync(props.second);
  console.log(some); // @reaches mutate-async stdout @reaches mutate-async external-effect
}

export function IgnoredPayload(props: { input: string }) {
  const mutation = useMutation({ mutationFn: async (_value: string) => "fixed" }); // @reaches mutate-dropped parameter
  // The function drops what it is given, so no route reaches the result.
  // @trace mutate-dropped forward props.input @no-path mutate-dropped "props.input" "result"
  const result = mutation.mutateAsync(props.input);
  console.log(result); // @never-reaches mutate-dropped
}
