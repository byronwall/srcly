import { encodeAnchor, encodeAnchors, folderOf, MAX_ANCHORS, normalizeScopeName, parseAnchors, splitAt, type Direction, type Location } from "./location";

// The actions every node offers in both views, whatever opened the menu.

export type NodeKind = "folder" | "file" | "symbol" | "external";

export type NodeActionId = "focus" | "expand" | "open" | "folder" | "traceTo" | "traceFrom" | "traceAdd";

/** The two trace actions: the graph anchored at this symbol, one way. */
export const TRACE_DIRECTION: Record<"traceTo" | "traceFrom", Direction> = { traceTo: "forward", traceFrom: "backward" };

/** The bare name an `at` ends in, when it can anchor the engine: an identifier, or a JSX tag's component. Null for anonymous scopes. */
export function symbolNameOf(at: string): string | null {
  const { scopes } = splitAt(at);
  const last = normalizeScopeName(scopes[scopes.length - 1] ?? "").replace(/^<|>$/g, "");
  return /^[A-Za-z_$][\w$]*$/.test(last) ? last : null;
}

/**
 * Where "Trace where it goes / comes from" takes the view: Data flow mode
 * anchored at the symbol by name on its declaration line, in that direction;
 * a file or folder (no line) is anchored through its exports (T19).
 */
export function tracePatch(target: { at: string; line?: number }, id: "traceTo" | "traceFrom"): Partial<Location> {
  const { file, scopes } = splitAt(target.at);
  const name = symbolNameOf(target.at) ?? "";
  const anchor = scopes.length && target.line ? encodeAnchor({ file, name, line: target.line }) : encodeAnchor({ file, exports: true });
  return {
    view: "graph",
    flow: undefined,
    field: undefined,
    dest: undefined,
    open: undefined,
    anchor,
    dir: TRACE_DIRECTION[id],
  };
}

/**
 * Add this symbol to the anchors already traced (T20): the same direction,
 * one more anchor on the same canvas. Null when the view is not in anchor
 * mode, the anchors are full, the symbol is already one, or it has no line.
 */
export function addAnchorPatch(target: { at: string; line?: number }, current: Location): Partial<Location> | null {
  const anchors = parseAnchors(current.anchor);
  if (!anchors.length || anchors.length >= MAX_ANCHORS || anchors.some((a) => "exports" in a)) return null;
  const { file, scopes } = splitAt(target.at);
  const name = symbolNameOf(target.at);
  if (!scopes.length || !name || !target.line) return null;
  const next = { file, name, line: target.line };
  if (anchors.some((a) => encodeAnchor(a) === encodeAnchor(next))) return null;
  return { anchor: encodeAnchors([...anchors, next]) };
}

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
  /** A symbol's declaration line, when known: the trace actions anchor there. */
  line?: number;
  /** The place the view is at: in anchor mode, a symbol can join the anchors (T20). */
  current?: Location;
}): NodeAction[] {
  const { at, kind, currentAt, expand, line, current } = target;
  const traceReason =
    kind === "external" ? "Outside this repo" : kind !== "symbol" ? (at === "" ? "Pick a folder or file" : undefined) : !symbolNameOf(at) ? "No name to anchor at" : !line ? "No line for it" : undefined;
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
    { id: "traceTo", label: "Trace where it goes", disabledReason: traceReason },
    { id: "traceFrom", label: "Trace where it comes from", disabledReason: traceReason },
    ...(current && parseAnchors(current.anchor).length
      ? [{
          id: "traceAdd" as const,
          label: `Add to the trace (${parseAnchors(current.anchor).length} of ${MAX_ANCHORS})`,
          disabledReason:
            kind !== "symbol" ? "Needs a symbol" : traceReason ?? (parseAnchors(current.anchor).length >= MAX_ANCHORS ? `At most ${MAX_ANCHORS} anchors` : addAnchorPatch({ at, line }, current) ? undefined : "Already an anchor"),
        }]
      : []),
  ];
}
