import { useWorkspace } from "./notes-context";
import { NoteHeader } from "./NoteHeader";
import { NoteList } from "./NoteList";

export function NotesPage() {
  const workspace = useWorkspace();
  const settings = { wrap: true };
  return (
    <main>
      <NoteHeader name={workspace.name} count={3} owner={workspace.id} />
      <NoteList workspace={workspace} settings={settings} />
    </main>
  );
}
