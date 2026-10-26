// An array literal packs its elements and what it spreads, a `for…of`
// binding takes each element it iterates, and a JSX spread hands every
// field to the element: `props.first` and `props.rest` reach the slot through
// `all` and `item`, and `props.attrs` reaches the div. A `for…in` binding
// takes the keys, not the values: `props.table` never reaches `key`'s slot.
export function Joined(props: { first: string; rest: string[]; attrs: Record<string, string> }) {
  const all = [props.first, ...props.rest];
  for (const item of all) {
    if (item) return <b {...props.attrs}>{item}</b>;
  }
  return null;
}

export function Keys(props: { table: Record<string, number> }) {
  for (const key in props.table) return <i>{key}</i>;
  return null;
}
