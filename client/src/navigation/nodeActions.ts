import { folderOf } from "./location";

// The actions every node offers in both views, whatever opened the menu.

export type NodeKind = "folder" | "file" | "symbol" | "external";

export type NodeActionId = "focus" | "open" | "folder";

export interface NodeAction {
  id: NodeActionId;
  label: string;
  /** Why it is unavailable, shown in place of running it. */
  disabledReason?: string;
}

/**
 * Focus · Open code · Show folder, with each one's availability for this node
 * given where the view is now (`currentAt`). An action that wouldn't move
 * anything is disabled with the reason, never a silent no-op.
 */
export function nodeActions(target: { at: string; kind: NodeKind; currentAt: string }): NodeAction[] {
  const { at, kind, currentAt } = target;
  return [
    {
      id: "focus",
      label: "Focus",
      disabledReason: at === currentAt ? "Already here" : undefined,
    },
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
