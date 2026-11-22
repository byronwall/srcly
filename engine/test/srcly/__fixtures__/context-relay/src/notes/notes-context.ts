export type Workspace = { id: string; name: string };
export type NoteSettings = { wrap: boolean };

export function useWorkspace(): Workspace {
  return { id: "w1", name: "Notes" };
}
