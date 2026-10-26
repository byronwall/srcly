// A call the engine classifies (a validation, a serialization) is still the
// call: its value goes where the call's goes. A classified call whose value
// nothing uses is still a dead end.
export const isReady = (state: { done: boolean }) => state.done; // @trace is-ready forward symbol isReady @outcome is-ready ok

export function Status(props: { state: { done: boolean }; count: number }) {
  const body = JSON.stringify(props.state); // @trace stringified forward props.state @outcome stringified ok
  JSON.stringify(props.count); // @trace discarded forward props.count @outcome discarded partial @stop discarded * call
  return <p data-body={body}>{isReady(props.state) ? "yes" : "no"}</p>; // @trace validated forward props.state @outcome validated ok @reaches validated,is-ready render-terminal @reaches stringified dom-terminal
}
