// A wrapper of the project's binds a call of its result to the function it
// was given only when it returns that function: its declared return is the
// argument's type (`wrap<T>(fn: T): T`). A wrapper that returns some other
// function (`compute` below) never runs the callback when its result is called.
function compute(_fn: (s: string) => void): () => number {
  return () => 0;
}

function wrap<T>(fn: T): T {
  return fn;
}

export function notWrapped(x: string) {
  const total = compute((s) => {
    console.error(s); // @never-reaches non-identity
  });
  total(x); // @trace non-identity forward x @outcome non-identity partial @stop non-identity disconnected call
}

export function wrapped(y: string) {
  const log = wrap((s: string) => {
    console.log(s); // @reaches identity
  });
  log(y); // @trace identity forward y @outcome identity ok
}
