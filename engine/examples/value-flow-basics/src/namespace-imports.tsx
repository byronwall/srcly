// A namespace import (`import * as api from "./namespace-api"`) reads each export by
// name: `api.store(x)` calls that function and `api.greeting` reads that value,
// as a named import would.
import * as api from "./namespace-api";

export function Shouted(props: { text: string }) {
  api.store(props.text); // @trace ns-call forward props.text
  const loud = api.shout(props.text); // @trace ns-return forward props.text
  return <p>{loud}</p>; // @reaches ns-return render-terminal
}

export function Greeting() {
  return <p>{api.greeting}</p>; // @trace ns-value backward api.greeting @outcome ns-value ok
}
