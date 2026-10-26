// A call the engine classifies (a validation, a serialization) is still the
// call: its value goes where the call's goes. A classified call whose value
// nothing uses is still a dead end.
export const isReady = (state: { done: boolean }) => state.done;

export function Status(props: { state: { done: boolean }; count: number }) {
  const body = JSON.stringify(props.state);
  JSON.stringify(props.count);
  return <p data-body={body}>{isReady(props.state) ? "yes" : "no"}</p>;
}
