import { db } from "./db-client";

// A database client's reads start a value and its writes end one. The read
// is where a row comes from; what is written ends at the write, named.
export async function titleOf(id: string) {
  const note = await db.note.findUnique({ where: { id } }); // @trace row backward symbol note @outcome row ok @reaches row external-read
  return note?.title;
}

export async function rename(id: string, title: string) { // @trace renamed forward symbol title @outcome renamed ok
  await db.note.update({ where: { id }, data: { title } }); // @reaches renamed external-effect
}

export async function add(title: string) { // @trace added forward symbol title @outcome added ok
  return db.note.create({ data: { title } }); // @reaches added external-effect @reaches added return
}
