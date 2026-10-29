// A Prisma-shaped client: method signatures with no body, as a generated client declares them.
export type NoteRow = { id: string; title: string; tagsJson: string; sourceId: string | null };
interface NoteDelegate {
  findUnique(args: { where: { id: string } }): Promise<NoteRow | null>;
  update(args: { where: { id: string }; data: { title: string } }): Promise<NoteRow>;
}
export declare const db: { note: NoteDelegate };
