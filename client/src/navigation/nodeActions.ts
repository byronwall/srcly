import { folderOf } from "./location";

// The actions every node offers in both views, whatever opened the menu.

export type NodeKind = "folder" | "file" | "symbol" | "external";

export type NodeActionId = "focus" | "expand" | "open" | "folder";

export interface NodeAction {
  id: NodeActionId;
  label: string;
  /** Why it is unavailable, shown in place of running it. */
  disabledReason?: string;
}

/**
 * Focus (Isolate for a symbol) · Open code · Show folder, with each one's availability for this node
 * given where the view is now (`currentAt`). An action that wouldn't move
 * anything is disabled with the reason, never a silent no-op.
 */
export function nodeActions(target: {
  at: string;
  kind: NodeKind;
  currentAt: string;
  /** Graph only: the box can open in place (`true`), or is inside an opened folder that can close (`"collapse"`). */
  expand?: boolean | { collapse: string };
}): NodeAction[] {
  const { at, kind, currentAt, expand } = target;
  const expandAction: NodeAction[] =
    expand === true
      ? [{ id: "expand", label: kind === "file" ? "Expand symbols" : "Expand in place" }]
      : expand
        ? [{ id: "expand", label: `Collapse ${expand.collapse}` }]
        : [];
  return [
    {
      id: "focus",
      // A symbol shown on its own, without its file's other symbols.
      label: kind === "symbol" ? "Isolate" : "Focus",
      disabledReason: at === currentAt ? "Already here" : undefined,
    },
    ...expandAction,
    {
      id: "open",
      label: "Open code",
      disabledReason:
        kind === "folder" ? "Folders have no code" : kind === "external" ? "Outside this repo" : undefined,
    },
    {
      id: "folder",
      label: "Show folder",
      disabledReason:
        kind === "external"
          ? "Outside this repo"
          : at === ""
            ? "Already at the root"
            : folderOf(at) === currentAt
              ? "Already showing it"
              : undefined,
    },
  ];
}
