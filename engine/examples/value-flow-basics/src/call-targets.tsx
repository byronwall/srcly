// What a call is, by what it calls. A function written where it is called
// (an IIFE) is entered like any first-party function: its argument binds its
// parameter and its return comes back out at the call, never ending there.
// A standard-library method (`Map.get`) is a collection method, not a
// service read; a method a service interface declares with no body is.
interface Records {
  find(id: string): string;
}
declare const records: Records;

export function Called(props: { count: number; key: string; id: string }) {
  const next = ((n: number) => n + 1)(props.count); // @trace iife forward props.count @outcome iife ok @visits iife parameter "n" @visits iife return
  const names = new Map([["a", "Ann"]]);
  const name = names.get(props.key); // @trace map-get forward props.key @outcome map-get partial
  const row = records.find(props.id); // @trace service-read forward props.id @outcome service-read partial @stop service-read external-code external-read
  return (
    <p>
      {/* @reaches iife render-terminal "next" @reaches map-get render-terminal "name" @reaches service-read render-terminal "row" */}
      {next} {name} {row}
    </p>
  );
}
