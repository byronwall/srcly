// The view-state registry (T17): what Back and Return restore beyond the URL.
// Owners register what the URL does not carry (the camera, the selection, the
// metric, the graph filters); the navigation store captures every owner when
// a place is left and hands the parts back when the place is returned to.
// Snapshots live in sessionStorage under a token kept in `history.state`, so
// the browser's Back and Forward restore them and a copied URL opens plain.

export type ViewStateParts = Record<string, unknown>;
export interface ViewStateSnapshot {
  /** The URL search the parts belong to; a part is only applied to the same place. */
  search: string;
  parts: ViewStateParts;
  at: number;
}

export interface ViewStateOwner<T = unknown> {
  capture(): T;
  /** Apply a part captured earlier. An owner that is not ready yet keeps it for when it is. */
  restore(part: T): void;
}

const owners = new Map<string, ViewStateOwner>();
/** Parts of the latest restore that no owner has taken yet, for owners that mount later. */
let pending: ViewStateSnapshot | null = null;

/** Join the registry under `key`; the returned function leaves it. A later owner with the same key replaces the earlier one. */
export function registerViewState<T>(key: string, owner: ViewStateOwner<T>): () => void {
  owners.set(key, owner as ViewStateOwner);
  // A place returned to before this owner mounted: its part is still waiting.
  if (pending && key in pending.parts && pending.search === currentSearch()) {
    const part = pending.parts[key];
    delete pending.parts[key];
    owner.restore(part as T);
  }
  return () => {
    if (owners.get(key) === owner) owners.delete(key);
  };
}

/** `search` names the place the parts belong to: the entry being left, which on popstate is no longer the URL. */
export function captureViewState(search: string = currentSearch()): ViewStateSnapshot {
  const parts: ViewStateParts = {};
  for (const [key, owner] of owners) {
    try {
      parts[key] = owner.capture();
    } catch {
      // An owner that cannot capture leaves its part out; the rest still restore.
    }
  }
  return { search, parts, at: Date.now() };
}

/** Hand every part to its owner; parts whose owner is not mounted wait for it. */
export function restoreViewState(snapshot: ViewStateSnapshot): void {
  pending = { ...snapshot, parts: { ...snapshot.parts } };
  for (const [key, owner] of owners) {
    if (!(key in pending.parts)) continue;
    const part = pending.parts[key];
    delete pending.parts[key];
    try {
      owner.restore(part);
    } catch {
      // A part the owner no longer understands is dropped.
    }
  }
}

/** Forget parts still waiting: the user moved on before their owner mounted. */
export function clearPendingViewState(): void {
  pending = null;
}

const STORAGE_PREFIX = "srcly-view-";

export function saveViewState(token: string, snapshot: ViewStateSnapshot): void {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(snapshot));
  } catch {
    // Storage is a convenience; without it Return still restores the URL.
  }
}

export function loadViewState(token: string): ViewStateSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + token);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewStateSnapshot;
    return parsed && typeof parsed === "object" && typeof parsed.search === "string" && parsed.parts && typeof parsed.parts === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function newViewStateToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

/** For tests: forget every owner and pending part. */
export function resetViewStateForTests(): void {
  owners.clear();
  pending = null;
}
