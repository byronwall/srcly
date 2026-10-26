// An array literal packs its elements and what it spreads, a `for…of`
// binding takes each element it iterates, and a JSX spread hands every
// field to the element: `props.first` and `props.rest` reach the slot through
// `all` and `item`, and `props.attrs` reaches the div. A `for…in` binding
// takes the keys, not the values: `props.table` never reaches `key`'s slot.
export function Joined(props: { first: string; rest: string[]; attrs: Record<string, string> }) {
  const all = [props.first, ...props.rest]; // @trace col-first forward props.first @trace col-rest forward props.rest @outcome col-first,col-rest ok
  for (const item of all) { // @visits col-first,col-rest alias * "item"
    if (item) return <b {...props.attrs}>{item}</b>; // @trace attrs forward props.attrs @outcome attrs ok @reaches col-first,col-rest render-terminal @reaches attrs dom-terminal
  }
  return null;
}

export function Keys(props: { table: Record<string, number> }) {
  for (const key in props.table) return <i>{key}</i>; // @trace table forward props.table @stop table disconnected * "table"
  return null;
}
