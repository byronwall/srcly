import { batch, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import { Crosshair, PanelRight, Redo2, Search, Undo2 } from "lucide-solid";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback/States";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import { isExternal, splitAt, symbolIdOf } from "../../../navigation/location";
import { canReturn, go, location, replace, returnBack } from "../../../navigation/store";
import NodeActionsMenu, { type NodeMenuTarget } from "../../../navigation/NodeActionsMenu";
import { addAnchorPatch, refsPatch, tracePatch } from "../../../navigation/nodeActions";
import { registerViewState } from "../../../navigation/viewState";
import { fetchSymbolGraph, SymbolApiError } from "../../../symbols/api";
import { atOf, baseName, qualifiedOf, REF_KIND_SPEC, REF_KINDS, type RefKind, type SymbolGraph } from "../../../symbols/contract";
import { ViewTools } from "../../viewToolbar";
import { DependencyCanvas, type Camera, type CanvasApi } from "../DependencyCanvas";
import { createFetch } from "../flow/fetchSignal";
import { FlowModeSwitch } from "../flow/FlowTools";
import { layoutWithHubs } from "../hubs";
import type { ViewLayout } from "../layout";
import type { ViewNode } from "../viewModel";
import { labelOf, symbolGraphToViewModel } from "./adapter";
import { SymbolInspector } from "./SymbolInspector";
import { SymbolLegend } from "./SymbolLegend";
import { SymbolPalette } from "./SymbolPalette";

const INSPECTOR_KEY = "srcly.symbolInspector";
const KINDS_KEY = "srcly.symbolKinds";
const TESTS_KEY = "srcly.symbolTests";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v !== "0";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Remembering a toggle is a convenience only.
  }
}
function readKinds(): Set<RefKind> {
  try {
    const raw = window.localStorage.getItem(KINDS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(list)) {
      const kinds = list.filter((k): k is RefKind => REF_KINDS.includes(k as RefKind));
      if (kinds.length) return new Set(kinds);
    }
  } catch {
    // A fresh default.
  }
  return new Set(REF_KINDS);
}
function writeKinds(kinds: Set<RefKind>) {
  try {
    window.localStorage.setItem(KINDS_KEY, JSON.stringify([...kinds]));
  } catch {
    // Remembering the filters is a convenience only.
  }
}

/**
 * The focus Symbols mode derives from `at` when the URL names none: a
 * file (its module), a scope chain (its qualified name); nothing for the
 * root, a folder or an external package.
 */
function derivedFocus(at: string): string {
  if (!at || isExternal(at)) return "";
  const { file, scopes } = splitAt(at);
  if (!scopes.length && !/\.[A-Za-z0-9]+$/.test(file)) return "";
  return symbolIdOf(at) ?? "";
}

/**
 * Symbols mode of the graph view (`?view=graph&symbols=<id>`): one symbol of
 * the reference index in the centre with its members, what references them
 * on the left and what they reference on the right, from `/api/symbols/graph`.
 * Click selects a box (the rail lists its references by line); Shift-click or
 * E opens a box's own hop in place; F centres on it; double-click or O opens
 * its code; `/` finds any symbol.
 */
export default function SymbolsView(props: { rootPath: string; onOpen: (at: string, line?: number) => void }) {
  const root = () => props.rootPath;
  const focus = createMemo(() => location().symbols || derivedFocus(location().at));
  const openList = () => location().open ?? [];
  const [kinds, setKinds] = createSignal<Set<RefKind>>(readKinds());
  const [tests, setTests] = createSignal(readFlag(TESTS_KEY, false));
  const [inspector, setInspector] = createSignal(readFlag(INSPECTOR_KEY, true));
  const [selected, setSelected] = createSignal<string | null>(null);
  const [hovered, setHovered] = createSignal<ViewNode | null>(null);
  const [palette, setPalette] = createSignal(false);
  const [menu, setMenu] = createSignal<(NodeMenuTarget & { node: ViewNode }) | null>(null);
  const [shiftHeld, setShiftHeld] = createSignal(false);
  const [layout, setLayout] = createSignal<ViewLayout | null>(null);
  const [anchor, setAnchor] = createSignal<string | null>(null);
  let canvas: CanvasApi | undefined;
  let host!: HTMLDivElement;
  let pendingAnchor: string | null = null;

  const graphKey = createMemo(() => (root() && focus() ? `${root()}\n${focus()}\n${openList().join(",")}\n${tests() ? 1 : 0}` : null));
  const graphFetch = createFetch(graphKey, (key) => {
    const [path, at, more, withTests] = key.split("\n");
    return fetchSymbolGraph({ path, at, more: more ? more.split(",") : [], tests: withTests === "1" });
  });
  const graph = graphFetch.value;
  /** The answer for the current focus; an older answer stays off the canvas. */
  const current = (): SymbolGraph | null => {
    const g = graph();
    return g && g.focus === focus() ? g : null;
  };
  const model = createMemo(() => {
    const g = current();
    return g ? symbolGraphToViewModel(g, { kinds: kinds(), expanded: openList() }) : null;
  });

  let token = 0;
  createEffect(() => {
    const m = model();
    if (!m) return setLayout(null);
    const mine = ++token;
    const rect = host?.getBoundingClientRect();
    const viewport = rect && rect.height > 0 ? { width: rect.width, height: rect.height } : undefined;
    const aspectRatio = viewport ? viewport.width / viewport.height : 1.6;
    const anchorId = pendingAnchor;
    pendingAnchor = null;
    const previous = anchorId ? (untrack(layout) ?? undefined) : undefined;
    void Promise.resolve().then(() => {
      if (mine !== token) return;
      const next = layoutWithHubs(m.vm, { aspectRatio, viewport, previous });
      batch(() => {
        setAnchor(previous ? anchorId : null);
        setLayout(next);
      });
    });
  });

  // ---- view state: what Return restores beyond the URL ----
  let restoreCamera: { camera: Camera; search: string } | null = null;
  onCleanup(
    registerViewState<{ selected: string | null; camera: Camera | null }>("symbols.view", {
      capture: () => ({ selected: selected(), camera: canvas?.getCamera() ?? null }),
      restore: (part) => {
        setSelected(typeof part?.selected === "string" ? part.selected : null);
        const camera = part?.camera;
        restoreCamera = camera && Number.isFinite(camera.k) && Number.isFinite(camera.x) && Number.isFinite(camera.y) ? { camera, search: window.location.search } : null;
      },
    }),
  );
  const cameraForLayout = () => {
    const held = restoreCamera;
    restoreCamera = null;
    return held && held.search === window.location.search ? held.camera : null;
  };

  // ---- actions ----
  const focusOn = (id: string) => {
    if (id === focus()) return;
    setSelected(null);
    go({ symbols: id, open: undefined });
  };
  const setOpen = (ids: string[]) => replace({ open: [...new Set(ids)].sort() });
  const expand = (id: string) => {
    pendingAnchor = id;
    setOpen([...openList(), id]);
  };
  const collapse = (id: string) => {
    pendingAnchor = id;
    setOpen(openList().filter((x) => x !== id));
  };
  const toggleOpen = (n: ViewNode) => {
    if (n.expandable) expand(n.id);
    else if (openList().includes(n.id)) collapse(n.id);
  };
  const collapsible = (groupId: string) => openList().includes(groupId) || (model()?.vm.nodes ?? []).some((n) => n.group?.id === groupId && openList().includes(n.id));
  const collapseGroup = (groupId: string) => {
    const inside = (model()?.vm.nodes ?? []).filter((n) => n.group?.id === groupId && openList().includes(n.id)).map((n) => n.id);
    pendingAnchor = groupId;
    setOpen(openList().filter((x) => x !== groupId && !inside.includes(x)));
  };
  /** Open a line of a file of the index in the code viewer: by the symbol's top-level name, then its line. */
  const openAt = (file: string, line: number, id?: string) => props.onOpen(id ? atOf(id) : file, line);
  const openNode = (n: ViewNode) => {
    const s = model()?.byId.get(n.id);
    if (s) openAt(s.file, s.line, s.id);
  };
  const toggleInspector = () => {
    const next = !inspector();
    setInspector(next);
    writeFlag(INSPECTOR_KEY, next);
  };
  /** One chip per kind, but extends and implements share one: both are heritage. */
  const CHIPS: { kinds: RefKind[]; label: string; hint: string }[] = [
    { kinds: ["call"], label: "Calls", hint: REF_KIND_SPEC.call.hint },
    { kinds: ["instantiate"], label: "New", hint: REF_KIND_SPEC.instantiate.hint },
    { kinds: ["read"], label: "Reads", hint: REF_KIND_SPEC.read.hint },
    { kinds: ["write"], label: "Writes", hint: REF_KIND_SPEC.write.hint },
    { kinds: ["type"], label: "Types", hint: REF_KIND_SPEC.type.hint },
    { kinds: ["extends", "implements"], label: "Extends", hint: `${REF_KIND_SPEC.extends.hint}; ${REF_KIND_SPEC.implements.hint}` },
  ];
  const toggleKinds = (list: RefKind[]) => {
    const next = new Set(kinds());
    const on = list.some((k) => next.has(k));
    for (const k of list) on ? next.delete(k) : next.add(k);
    if (!next.size) return;
    setKinds(next);
    writeKinds(next);
  };
  const toggleTests = () => {
    const next = !tests();
    setTests(next);
    writeFlag(TESTS_KEY, next);
  };
  const onBoxClick = (n: ViewNode) => setSelected(selected() === n.id ? null : n.id);
  const pickFromPalette = (id: string, mode: "focus" | "code") => {
    const hit = model()?.byId.get(id);
    if (mode === "code" && hit) return openAt(hit.file, hit.line, hit.id);
    focusOn(id);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.key === "Shift") setShiftHeld(true);
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.key === "ArrowLeft" && canReturn()) returnBack();
        else if (e.key === "ArrowRight") window.history.forward();
        else return;
        return e.preventDefault();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const n = layout()?.nodes.find((p) => p.id === selected())?.node ?? hovered();
      if (key === "/") setPalette(true);
      else if (key === "0") canvas?.fit();
      else if (key === "i") toggleInspector();
      else if (key === "t") toggleTests();
      else if (key === "Escape" && selected()) setSelected(null);
      else if (n && key === "f") focusOn(n.id);
      else if (n && (key === "o" || key === "Enter")) openNode(n);
      else if (n && (key === "e" || key === " ")) toggleOpen(n);
      else return;
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    });
  });

  const focusNode = () => current()?.nodes.find((n) => n.id === focus()) ?? null;
  const focusText = () => {
    const n = focusNode();
    return n ? labelOf(n) : qualifiedOf(focus()) || baseName(focus());
  };
  const stats = () => {
    const m = model();
    const g = current();
    if (!m || !g) return "";
    const parts = [`${m.vm.nodes.length} symbol${m.vm.nodes.length === 1 ? "" : "s"}`, `${m.vm.edges.length} reference${m.vm.edges.length === 1 ? "" : "s"}`];
    if (m.hiddenByKind) parts.push(`${m.hiddenByKind} hidden by the kind filters`);
    if (g.truncated) parts.push("cut at the neighbourhood limit: hide kinds or tests");
    parts.push(`index: ${g.index.symbols.toLocaleString("en-US")} symbols, ${g.index.references.toLocaleString("en-US")} references in ${g.index.files} files`);
    return parts.join(" · ");
  };
  const notFound = () => {
    const e = graphFetch.error();
    return e instanceof SymbolApiError && e.status === 404 ? e.message : null;
  };
  const loading = () => graphFetch.loading() && !current();
  const failure = () => (notFound() ? null : graphFetch.error());
  /** The status line's bold part: the hovered or selected box, else the focus. */
  const statusText = () => {
    const n = hovered() ?? (selected() ? model()?.vm.nodes.find((v) => v.id === selected()) : null);
    const s = n ? model()?.byId.get(n.id) : null;
    if (!s) return `${focusText()} · click a box to list its references · ⇧click opens a hop · F centres · / finds a symbol`;
    return `${labelOf(s)} · ${s.kind} · ${s.inCount} in · ${s.outCount} out${n?.expandable ? " · ⇧click or E opens its hop" : ""}`;
  };

  return (
    <div class="flex h-full flex-col bg-[var(--plc-surface)]">
      <ViewTools>
        <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 bg-[var(--plc-border)]" />
        <FlowModeSwitch />
        <Button variant="ghost" class="max-w-[14rem] gap-1 px-2" onClick={() => setPalette(true)} title="The symbol in the centre · click to find another (/)" data-symbol-focus>
          <Crosshair size={13} aria-hidden="true" class="shrink-0 text-[var(--plc-accent)]" />
          <span class="text-[var(--plc-on-muted)]">Symbol</span>
          <span class="min-w-0 truncate font-mono text-[11.5px] font-medium">{focus() ? focusText() : "none"}</span>
        </Button>
        <div role="group" aria-label="Reference kinds" class="flex shrink-0 items-center gap-0.5 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
          <For each={CHIPS}>
            {(chip) => (
              <Button variant="tab" size="sm" class="px-1.5" active={chip.kinds.some((k) => kinds().has(k))} aria-pressed={chip.kinds.some((k) => kinds().has(k))} title={chip.hint} onClick={() => toggleKinds(chip.kinds)} data-ref-kind={chip.kinds[0]}>
                {chip.label}
              </Button>
            )}
          </For>
        </div>
        <Button variant="ghost" class="px-2" active={tests()} aria-pressed={tests()} onClick={toggleTests} title="Show symbols in test files (T)" data-symbol-tests>
          Tests
        </Button>
        <Button variant="ghost" class="px-2" onClick={() => canvas?.fit()} title="Fit the graph to the window (0)" disabled={!layout()}>
          Fit
        </Button>
        <IconButton label="Return" title="Return to the previous place as you left it (Alt+←)" onClick={returnBack} disabled={!canReturn()}>
          <Undo2 size={14} aria-hidden="true" />
        </IconButton>
        <IconButton label="Forward" title="Forward again (Alt+→)" onClick={() => window.history.forward()}>
          <Redo2 size={14} aria-hidden="true" />
        </IconButton>
        <Button variant="ghost" class="gap-1 px-2" active={inspector()} aria-pressed={inspector()} onClick={toggleInspector} title="Show or hide the inspector (I)">
          <PanelRight size={13} aria-hidden="true" />
          Inspector
        </Button>
      </ViewTools>

      <div class="flex min-h-0 flex-1">
        <div ref={host} class="relative min-h-0 flex-1">
          <Show when={!focus()}>
            <EmptyState
              class="absolute inset-0"
              title="Pick a symbol"
              description="Symbols mode centres on one function, class, method, field, variable or type and draws who references it and what it references."
              actions={
                <Button variant="ghost" class="gap-1 px-2" onClick={() => setPalette(true)} title="Find a symbol (/)">
                  <Search size={13} aria-hidden="true" />
                  Find a symbol
                </Button>
              }
            />
          </Show>
          <Show when={focus() && loading()}>
            <LoadingState class="absolute inset-0" label={`Indexing symbols and looking up ${focusText()}…`} />
          </Show>
          <Show when={notFound()}>
            {(message) => (
              <EmptyState
                class="absolute inset-0"
                title="Not in the index"
                description={`${message()}. The index holds every function, class, method, field, variable and type of the TypeScript and Python files under this root.`}
                actions={
                  <Button variant="ghost" class="gap-1 px-2" onClick={() => setPalette(true)} title="Find a symbol (/)">
                    <Search size={13} aria-hidden="true" />
                    Find a symbol
                  </Button>
                }
              />
            )}
          </Show>
          <Show when={failure()}>{(e) => <ErrorState message={e().message} class="absolute inset-0" />}</Show>
          <Show when={layout()}>
            {(l) => (
              <>
                <DependencyCanvas
                  layout={l()}
                  anchor={anchor() ?? undefined}
                  focusId={focus()}
                  onFocus={onBoxClick}
                  onOpen={openNode}
                  onToggleOpen={toggleOpen}
                  shiftHeld={shiftHeld()}
                  onPointerAct={() => undefined}
                  onHover={setHovered}
                  onMenu={(node, at) => {
                    const s = model()?.byId.get(node.id);
                    setMenu({ node, at: atOf(node.id), kind: "symbol", title: s ? `${qualifiedOf(s.id) || baseName(s.file)} · ${s.file}` : node.title, x: at.x, y: at.y, currentAt: location().at, line: s?.line, current: location() });
                  }}
                  selectedId={selected() ?? undefined}
                  collapsible={collapsible}
                  onCollapse={collapseGroup}
                  ref={(api) => (canvas = api)}
                  cameraForLayout={cameraForLayout}
                  linkCounts={false}
                  regionTitles={{ in: "← Referenced by", out: "References →" }}
                />
                <SymbolLegend />
              </>
            )}
          </Show>
        </div>
        <Show when={inspector() && current() && model()}>
          <SymbolInspector
            graph={current()!}
            model={model()!}
            selected={selected()}
            kinds={kinds()}
            onOpen={openAt}
            onSelect={setSelected}
            onFocus={focusOn}
            onExpand={expand}
            onClose={toggleInspector}
          />
        </Show>
      </div>

      <div class="flex items-center gap-3 border-t border-[var(--plc-border)] px-3 py-1 text-[11px] text-[var(--plc-on-subtle)]" aria-live="polite">
        <span class="max-w-[60%] shrink-0 truncate font-semibold text-[var(--plc-on-surface)]" title={statusText()}>
          {statusText()}
        </span>
        <span class="ml-auto min-w-0 truncate tabular-nums" data-symbol-stats={model() ? "ready" : "none"} title={stats()}>
          {stats()}
        </span>
      </div>

      <SymbolPalette open={palette()} rootPath={root()} tests={tests()} onClose={() => setPalette(false)} onPick={(hit, mode) => (mode === "code" ? openAt(hit.file, hit.line, hit.id) : pickFromPalette(hit.id, mode))} />

      <Show when={menu()}>
        {(m) => (
          <NodeActionsMenu
            target={m()}
            onClose={() => setMenu(null)}
            onAction={(id) => {
              const n = m().node;
              if (id === "focus") focusOn(n.id);
              else if (id === "expand") toggleOpen(n);
              else if (id === "open") openNode(n);
              else if (id === "refs") go(refsPatch({ at: m().at }));
              else if (id === "traceTo" || id === "traceFrom") go(tracePatch({ at: m().at, line: m().line }, id));
              else if (id === "traceAdd") {
                const patch = addAnchorPatch({ at: m().at, line: m().line }, location());
                if (patch) go(patch);
              } else go({ at: m().at.slice(0, m().at.lastIndexOf("/")), symbols: undefined, open: undefined });
            }}
          />
        )}
      </Show>
    </div>
  );
}
