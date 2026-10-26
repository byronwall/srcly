// One helper, two calls (T13). Each call's result belongs to that call alone:
// a forward walk from `props.a` reaches the first slot through id(), never the
// second, and from `props.b` the second, never the first.
function id(value: string) { // @trace id-param backward value
  return value; // @trace id-return forward value @outcome id-return ok
}

export function TwoCalls(props: { a: string; b: string }) { // @stop id-param,id-b-back untraced parameter
  return (
    <div>
      <span>{id(props.a)}</span>{/* @trace id-a forward props.a @outcome id-a ok @reaches id-a,id-return @never-reaches id-b @never-reaches id-b-back field-read @visits id-param field-read "a" */}
      <em>{id(props.b)}</em>{/* @trace id-b forward props.b @trace id-b-back backward id(props.b) @reaches id-b,id-return @never-reaches id-a @visits id-param,id-b-back field-read "b" */}
    </div>
  );
}
