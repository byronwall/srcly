import { db } from "./db";
import { toDetail, type NoteDetail } from "../lib/notes";

export async function fetchNote(id: string): Promise<NoteDetail> {
  "use server";
  const row = await db.note.findUnique({ where: { id } });
  if (!row) throw new Error(`No note ${id}`);
  return toDetail(row);
}

export async function saveTitle(id: string, title: string) {
  "use server";
  const clean = title.trim();
  await db.note.update({ where: { id }, data: { title: clean } });
}
