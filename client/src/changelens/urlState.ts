// The Changes view's URL state. `location().changes` holds the raw parameters
// (navigation/location.ts); this file gives them names and defaults.
//
//   cw     window: branch | 24h | 7d | custom
//   cm     mode: touched | net
//   cl     layout: edits | repo
//   cc     selected commit (a sha or WORKTREE)
//   cs     selected chunk id
//   cbase, chead, csince, cuntil   the custom window
//   clens  color: `<metric id>.now` or `<metric id>.delta`
//   chist  history of a time window: head | main (unset: the server picks)

import { createMemo } from "solid-js";
import { go, location, replace } from "../navigation/store";
import type { LensHistory, LensMode, LensWindow } from "./types";

export type LensLayout = "edits" | "repo";
export type ColorMode = "now" | "delta";

export interface LensState {
  window: LensWindow;
  mode: LensMode;
  layout: LensLayout;
  commit: string | null;
  chunk: string | null;
  changedPaths?: boolean;
  changedPath?: string | null;
  committedOnly?: boolean;
  pathLine?: number | null;
  pathSide?: "base" | "head" | null;
  base: string;
  head: string;
  since: string;
  until: string;
  metric: string;
  color: ColorMode;
  /** Null: HEAD, or main when HEAD is off it and empty in the window. */
  history: LensHistory | null;
}

export const DEFAULT_LENS: LensState = {
  window: "branch",
  mode: "touched",
  layout: "edits",
  commit: null,
  chunk: null,
  base: "",
  head: "",
  since: "",
  until: "",
  metric: "complexity",
  color: "delta",
  history: null,
};

const WINDOWS: readonly LensWindow[] = ["branch", "24h", "7d", "custom"];

export function parseLens(changes: string | undefined): LensState {
  const p = new URLSearchParams(changes ?? "");
  const window = p.get("cw") as LensWindow;
  const custom = window === "custom";
  const lens = p.get("clens") ?? "";
  const dot = lens.lastIndexOf(".");
  const color = lens.slice(dot + 1);
  const pathLine = Number(p.get("cpline"));
  return {
    window: WINDOWS.includes(window) ? window : DEFAULT_LENS.window,
    mode: p.get("cm") === "net" ? "net" : "touched",
    layout: p.get("cl") === "repo" ? "repo" : "edits",
    commit: p.get("cc"),
    chunk: p.get("cs"),
    ...(p.get("cpanel") === "paths" ? { changedPaths: true, changedPath: p.get("cpath"), pathSide: p.get("cpside") === "base" ? "base" : p.get("cpside") === "head" ? "head" : null } : {}),
    ...(p.get("cpanel") === "paths" && Number.isSafeInteger(pathLine) && pathLine > 0 ? { pathLine } : {}),
    ...(p.get("cworktree") === "off" ? { committedOnly: true } : {}),
    base: custom ? (p.get("cbase") ?? "") : "",
    head: custom ? (p.get("chead") ?? "") : "",
    since: custom ? (p.get("csince") ?? "") : "",
    until: custom ? (p.get("cuntil") ?? "") : "",
    metric: dot > 0 ? lens.slice(0, dot) : DEFAULT_LENS.metric,
    color: dot > 0 && (color === "now" || color === "delta") ? color : DEFAULT_LENS.color,
    history: p.get("chist") === "head" ? "head" : p.get("chist") === "main" ? "main" : null,
  };
}

/** The `changes` value for a state: defaults left out, so the plain view is a bare `?view=changes`. */
export function serializeLens(s: LensState): string {
  const p = new URLSearchParams();
  if (s.window !== DEFAULT_LENS.window) p.set("cw", s.window);
  if (s.mode !== DEFAULT_LENS.mode) p.set("cm", s.mode);
  if (s.layout !== DEFAULT_LENS.layout) p.set("cl", s.layout);
  if (s.commit) p.set("cc", s.commit);
  if (s.chunk) p.set("cs", s.chunk);
  if (s.changedPaths) {
    p.set("cpanel", "paths");
    if (s.changedPath) p.set("cpath", s.changedPath);
    if (s.pathSide) p.set("cpside", s.pathSide);
    if (s.pathLine) p.set("cpline", String(s.pathLine));
  }
  if (s.window === "custom") {
    if (s.base) p.set("cbase", s.base);
    if (s.head) p.set("chead", s.head);
    if (s.since) p.set("csince", s.since);
    if (s.until) p.set("cuntil", s.until);
  }
  if (s.committedOnly) p.set("cworktree", "off");
  if (s.history) p.set("chist", s.history);
  if (s.metric !== DEFAULT_LENS.metric || s.color !== DEFAULT_LENS.color) p.set("clens", `${s.metric}.${s.color}`);
  return p.toString();
}

export const lens = createMemo(() => parseLens(location().changes));

/**
 * Change the view's state. A push by default, so Back undoes it; `step` is
 * for arrow-key selection, which would bury the history under one entry per key.
 */
export function setLens(patch: Partial<LensState>, how: "push" | "step" = "push") {
  const changes = serializeLens({ ...lens(), ...patch }) || undefined;
  if (how === "step") replace({ changes });
  else go({ changes });
}
