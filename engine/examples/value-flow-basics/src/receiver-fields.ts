// A discarded library call writes into the field its receiver names: after
// `section.rows.push(row)`, a read of `section.rows` sees the row and a read
// of `section.title` does not. A push written as an arrow's body
// (`forEach((x) => rows.push(x))`) is discarded too: the library ignores
// what the callback returns.
export function fill(row: string, title: string) { // @trace field-write forward symbol row
  const section = { title, rows: [] as string[] };
  section.rows.push(row);
  console.log(section.title); // @never-reaches field-write field-read
  return section.rows; // @reaches field-write return
}

export function gather(items: string[]) { // @trace arrow-push forward symbol items
  const rows: string[] = [];
  items.forEach((item) => rows.push(item));
  return rows; // @reaches arrow-push return
}
