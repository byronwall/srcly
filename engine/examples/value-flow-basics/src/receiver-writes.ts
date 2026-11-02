// A library call that keeps its arguments (`rows.push(row)`) leaves them in its
// receiver. The receiver's root may be a local, an element of one
// (`groups[key].push(row)`), a closure's variable, or a parameter (a later read
// of it sees the value). Module state is written for code this function does
// not own: that write is not one the trace follows. `const n = rows.push(row)`
// keeps the argument too, and `n` is the count (`native-writes.js` is the pair).
const log: string[] = [];

export function group(key: string, row: string) { // @trace rw-indexed forward symbol row
  const groups: Record<string, string[]> = { [key]: [] };
  groups[key].push(row);
  return groups; // @reaches rw-indexed return
}

export function addTo(bag: { items: string[] }, item: string) { // @trace rw-param forward symbol item
  bag.items.push(item);
  return bag.items.length; // @reaches rw-param return
}

export function collect(items: string[], extra: string) { // @trace rw-closure forward symbol extra
  const rows: string[] = [];
  items.forEach(() => {
    rows.push(extra);
  });
  return rows; // @reaches rw-closure return
}

export function remember(entry: string) { // @trace rw-module forward symbol entry @outcome rw-module partial
  log.push(entry); // @stop rw-module external-code
}

export function count(row: string) { // @trace rw-kept forward symbol row
  const rows: string[] = [];
  const n = rows.push(row);
  return n; // @reaches rw-kept return
}
