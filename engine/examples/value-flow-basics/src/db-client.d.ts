// A Prisma-shaped client: method signatures with no body, as a generated client declares them.
type Note = { id: string; title: string };
interface NoteDelegate {
  findUnique(args: { where: { id: string } }): Promise<Note | null>;
  findFirst(args: { where: { title: string } }): Promise<Note | null>;
  update(args: { where: { id: string }; data: { title: string } }): Promise<Note>;
  create(args: { data: { title: string } }): Promise<Note>;
}
export declare const db: { note: NoteDelegate };
