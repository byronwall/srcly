import type { NoteSettings, Workspace } from "./notes-context";

export function NoteList(props: { workspace: Workspace; settings: NoteSettings }) {
  return <ul data-wrap={props.settings.wrap}>{props.workspace.name}</ul>;
}
