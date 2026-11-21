// The map of the Changes view, in both layouts. Tiles are positioned HTML
// boxes: the layout memo depends on the data, the size, the scope and the
// collapsed groups only, so a color change repaints fills and moves nothing.

import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { ChevronDown, ChevronRight } from "lucide-solid";
import type { Rect } from "../compare/treemapLayout";
import { metricLabel } from "../utils/metricsStore";
import { STATE_GLYPH, tileLook, type Lens, type TileLook } from "./colors";
import { beforeAfter, folderLabel, matchNote, plural, signed, STATUS_LABEL } from "./labels";
import { inScope, layoutEdits, layoutRepo, neighbour, repoTreeFromFiles, type ChunkTile, type GroupTile, type RepoFileTile, type RepoNode } from "./layout";
import { WORKTREE, type ChangeLensPayload, type LensChunk, type LensCommit } from "./types";
import type { LensLayout } from "./urlState";

const INK = "#0f172a";

const box = (r: Rect): JSX.CSSProperties => ({
  left: `${r.x0}px`,
  top: `${r.y0}px`,
  width: `${Math.max(0, r.x1 - r.x0)}px`,
  height: `${Math.max(0, r.y1 - r.y0)}px`,
});
const widthOf = (r: Rect) => r.x1 - r.x0;
const heightOf = (r: Rect) => r.y1 - r.y0;

/** What a tile says under its name: the lens's before → after, or why there is none. */
function valueText(chunk: LensChunk, lens: Lens, look: TileLook): string {
  if (look.state === "deleted") return "deleted";
  if (look.state === "reverted") return "reverted";
  if (look.state === "not-measured") return "not measured";
  const pair = chunk.metrics[lens.metric];
  return beforeAfter(lens.metric, pair) ?? "";
}

interface Hover {
  x: number;
  y: number;
  chunk?: LensChunk;
  file?: RepoFileTile;
}

export default function LensMap(props: {
  payload: ChangeLensPayload;
  layout: LensLayout;
  /** The folder or file the map is zoomed to; "" is the repo. */
  scope: string;
  lens: Lens;
  selected: string | null;
  commit: LensCommit | null;
  /** The scan's file tree, repo-relative; null before a scan is loaded. */
  tree: RepoNode | null;
  /** Files in a folder, from the scan; null when unknown. */
  filesIn: (folder: string) => number | null;
  onSelect: (chunkId: string | null, how?: "push" | "step") => void;
  /** Open the chunk's diff. */
  onOpen: (chunkId: string) => void;
  onZoom: (path: string) => void;
}) {
  let host: HTMLDivElement | undefined;
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  const [hover, setHover] = createSignal<Hover | null>(null);

  onMount(() => {
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect;
      if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });

  const edits = createMemo(() => (props.layout === "edits" ? layoutEdits(props.payload.chunks, size(), props.scope, collapsed()) : null));
  const repo = createMemo(() =>
    props.layout === "repo" ? layoutRepo(props.tree ?? repoTreeFromFiles(props.payload.files), props.payload.files, props.payload.chunks, size(), props.scope) : null
  );
  /** Every tile a chunk can be selected on, for the arrow keys. */
  const tiles = createMemo<ChunkTile[]>(() => edits()?.chunks ?? repo()?.files.flatMap((f) => f.bands) ?? []);
  const inCommit = createMemo(() => (props.commit ? new Set(props.commit.chunkIds) : null));
  const dimmed = (id: string) => Boolean(inCommit() && !inCommit()!.has(id));

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const groupStats = (group: GroupTile) => {
    const files = props.payload.files.filter((f) => inScope(f.path, group.path));
    return {
      added: files.reduce((n, f) => n + f.added, 0),
      deleted: files.reduce((n, f) => n + f.deleted, 0),
      label: group.kind === "folder" ? folderLabel({ edited: files.length, total: props.filesIn(group.path), classes: files.map((f) => f.fileClass) }) : "",
      edited: files.length,
    };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const list = tiles();
    const current = list.find((t) => t.chunk.id === props.selected);
    if (e.key === "Escape" && props.selected) {
      e.preventDefault();
      props.onSelect(null);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      props.onOpen(current.chunk.id);
    } else if (e.key.startsWith("Arrow") && list.length) {
      e.preventDefault();
      // With nothing selected, the first arrow lands on the largest tile.
      const next = current ? neighbour(list, current, e.key) : [...list].sort((a, b) => widthOf(b.rect) * heightOf(b.rect) - widthOf(a.rect) * heightOf(a.rect))[0];
      if (next) props.onSelect(next.chunk.id, "step");
    }
  };

  const hoverChunk = (chunk: LensChunk) => (e: MouseEvent) => setHover({ x: e.clientX, y: e.clientY, chunk });

  const ChunkBox = (p: { tile: ChunkTile; band?: boolean }) => {
    const chunk = p.tile.chunk;
    const look = createMemo(() => tileLook(chunk, props.lens));
    const w = widthOf(p.tile.rect);
    const h = heightOf(p.tile.rect);
    const selected = () => props.selected === chunk.id;
    const muted = () => look().state === "reverted" || look().state === "deleted";
    return (
      <button
        type="button"
        tabIndex={-1}
        data-chunk={chunk.id}
        data-state={look().state}
        data-selected={selected() ? "" : undefined}
        aria-label={`${chunk.name}, ${STATUS_LABEL[chunk.status]}`}
        class="absolute cursor-pointer overflow-hidden rounded-[2px] p-0 text-left transition-opacity duration-150 hover:shadow-[inset_0_0_0_1px_var(--plc-on-surface)]"
        style={{
          ...box(p.tile.rect),
          background: look().fill,
          opacity: dimmed(chunk.id) ? 0.22 : 1,
          outline: look().state === "moved" ? "1px dashed rgba(15, 23, 42, 0.65)" : look().state === "reverted" ? "1px dashed var(--plc-on-disabled)" : p.band ? "1px solid rgba(15, 23, 42, 0.55)" : undefined,
          "outline-offset": p.band ? "-1px" : "-2px",
          "box-shadow": selected() ? "0 0 0 2px var(--plc-accent), inset 0 0 0 1px #fff" : undefined,
          "z-index": selected() ? 3 : p.band ? 2 : 1,
        }}
        onClick={(e) => {
          e.stopPropagation();
          props.onSelect(chunk.id);
        }}
        onDblClick={() => props.onOpen(chunk.id)}
        onMouseMove={hoverChunk(chunk)}
        onMouseLeave={() => setHover(null)}
      >
        <Show when={w >= 30 && h >= 15}>
          <span
            class="plc-data-sm absolute left-1 right-1 top-[2px] truncate"
            classList={{ "line-through": look().state === "deleted" }}
            style={{ color: muted() ? "var(--plc-on-muted)" : INK, "padding-right": STATE_GLYPH[look().state] && w >= 44 ? "12px" : undefined }}
          >
            {chunk.name}
          </span>
        </Show>
        <Show when={STATE_GLYPH[look().state] && w >= 44 && h >= 15}>
          <span aria-hidden="true" class="absolute right-1 top-[1px] text-[11px] font-semibold leading-[14px]" style={{ color: muted() ? "var(--plc-on-muted)" : INK }}>
            {STATE_GLYPH[look().state]}
          </span>
        </Show>
        <Show when={!p.band && w >= 56 && h >= 34}>
          <span class="plc-data-sm absolute left-1 right-1 top-[16px] truncate" style={{ color: muted() ? "var(--plc-on-subtle)" : "rgba(15, 23, 42, 0.72)" }}>
            {valueText(chunk, props.lens, look())}
          </span>
        </Show>
        {/* One tick per commit that changed the chunk: six edits to one handler read differently from one. */}
        <Show when={!p.band && chunk.touches.length > 1 && w >= 40 && h >= 50}>
          <span aria-hidden="true" class="absolute bottom-[3px] left-1 flex gap-[2px]">
            <For each={chunk.touches.slice(0, 12)}>
              {(touch) => <span class="h-[4px] w-[4px] rounded-[1px]" style={{ background: props.commit?.sha === touch.sha ? "var(--plc-accent)" : "rgba(15, 23, 42, 0.5)" }} />}
            </For>
          </span>
        </Show>
      </button>
    );
  };

  const GroupBox = (p: { group: GroupTile; repo?: boolean }) => {
    const g = p.group;
    const stats = createMemo(() => groupStats(g));
    const holdsSelection = () => Boolean(props.selected && g.chunkIds.includes(props.selected));
    const isDim = () => g.collapsed && g.chunkIds.every(dimmed) && Boolean(inCommit());
    const Chevron = g.collapsed ? ChevronRight : ChevronDown;
    const slash = g.kind === "folder" ? "/" : "";
    return (
      <div
        data-group={g.path}
        data-group-kind={g.kind}
        data-collapsed={g.collapsed ? "" : undefined}
        class="absolute overflow-hidden rounded-[3px]"
        classList={{
          "border border-[var(--plc-border)] bg-[var(--plc-surface-subtle)]": g.kind === "folder" && !g.collapsed,
          "bg-[var(--plc-surface)] shadow-[inset_0_0_0_1px_var(--plc-border)]": g.kind === "file" && !g.collapsed,
          "cursor-pointer border border-[var(--plc-border-strong)] bg-[var(--plc-surface-muted)] hover:border-[var(--plc-on-subtle)]": g.collapsed,
        }}
        style={{ ...box(g.rect), opacity: isDim() ? 0.3 : 1, "box-shadow": g.collapsed && holdsSelection() ? "0 0 0 2px var(--plc-accent)" : undefined, "z-index": g.collapsed ? 1 : 0 }}
        onClick={() => g.collapsed && toggle(g.path)}
        title={g.collapsed ? `Show the ${plural(g.chunkIds.length, "chunk")} in ${g.name}` : undefined}
      >
        <Show when={g.header || (g.collapsed && widthOf(g.rect) > 40 && heightOf(g.rect) > 15)}>
          <div class="flex h-[18px] items-center gap-1 whitespace-nowrap pl-0.5 pr-1.5 text-[11px] leading-[18px]">
            <Show when={!p.repo}>
              <button
                type="button"
                tabIndex={-1}
                data-group-toggle={g.path}
                aria-expanded={!g.collapsed}
                aria-label={`${g.collapsed ? "Expand" : "Collapse"} ${g.name}`}
                class="flex h-[16px] w-[14px] shrink-0 items-center justify-center rounded-sm text-[var(--plc-on-subtle)] hover:bg-[var(--plc-border)] hover:text-[var(--plc-on-surface)]"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(g.path);
                }}
              >
                <Chevron size={12} aria-hidden="true" />
              </button>
            </Show>
            <button
              type="button"
              tabIndex={-1}
              data-group-zoom={g.path}
              class="min-w-0 truncate font-medium hover:text-[var(--plc-accent)]"
              classList={{ "pl-1": p.repo, "text-[var(--plc-on-surface)]": stats().edited > 0, "text-[var(--plc-on-subtle)]": stats().edited === 0 }}
              title={`Zoom to ${g.path}`}
              onClick={(e) => {
                e.stopPropagation();
                props.onZoom(g.path);
              }}
            >
              {g.name}
              {slash}
            </button>
            {/* When room runs out the label goes first, then the counts; the name goes last. */}
            <Show when={stats().edited > 0}>
              <span class="min-w-0 flex-1 truncate text-[var(--plc-on-subtle)]" style={{ "flex-shrink": 1000 }}>
                {stats().label}
              </span>
              <span class="plc-data-sm shrink-0 tabular-nums" classList={{ hidden: widthOf(g.rect) < 130 }}>
                <span class="text-[var(--plc-success)]">+{stats().added}</span> <span class="text-[var(--plc-error)]">−{stats().deleted}</span>
              </span>
            </Show>
          </div>
        </Show>
        <Show when={g.collapsed && heightOf(g.rect) > 40}>
          <div class="px-[18px] text-[11px] text-[var(--plc-on-subtle)]">{plural(g.chunkIds.length, "chunk")}</div>
        </Show>
      </div>
    );
  };

  const FileBox = (p: { tile: RepoFileTile }) => {
    const t = p.tile;
    const w = widthOf(t.rect);
    const h = heightOf(t.rect);
    const edited = Boolean(t.file);
    /** A click on an edited file steps through its chunks, so a thin band is never the only target. */
    const cycle = () => {
      if (!t.bands.length) return;
      const i = t.bands.findIndex((b) => b.chunk.id === props.selected);
      props.onSelect(t.bands[(i + 1) % t.bands.length].chunk.id);
    };
    return (
      <div
        data-file={t.path}
        data-edited={edited ? "" : undefined}
        class="absolute overflow-hidden rounded-[2px]"
        classList={{
          "bg-[var(--plc-surface-muted)]": !edited,
          "cursor-pointer bg-[var(--plc-surface)] shadow-[inset_0_0_0_1.5px_var(--plc-on-surface)]": edited,
          "opacity-60": Boolean(t.file?.outOfScope),
        }}
        style={box(t.rect)}
        onClick={(e) => {
          if (!edited) return;
          e.stopPropagation();
          cycle();
        }}
        onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, file: t })}
        onMouseLeave={() => setHover(null)}
      >
        <Show when={w >= 34 && h >= 15 && (!edited || t.bands.every((b) => b.rect.y0 - t.rect.y0 > 15))}>
          <span class="plc-data-sm absolute left-1 right-1 top-[2px] truncate" style={{ color: edited ? INK : "var(--plc-on-disabled)" }}>
            {t.name}
          </span>
        </Show>
      </div>
    );
  };

  return (
    <div
      ref={host}
      tabIndex={0}
      role="application"
      aria-label={props.layout === "edits" ? "Edited chunks" : "Edited chunks in the repo map"}
      data-lens-map={props.layout}
      class="relative h-full w-full overflow-hidden bg-[var(--plc-surface)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--plc-border-focus)]"
      onKeyDown={onKeyDown}
    >
      <Show when={edits()}>
        {(l) => (
          <>
            <For each={l().groups}>{(group) => <GroupBox group={group} />}</For>
            <For each={l().chunks}>{(tile) => <ChunkBox tile={tile} />}</For>
          </>
        )}
      </Show>
      <Show when={repo()}>
        {(l) => (
          <>
            <For each={l().folders}>{(group) => <GroupBox group={group} repo />}</For>
            <For each={l().files}>{(tile) => <FileBox tile={tile} />}</For>
            <For each={l().files.flatMap((f) => f.bands)}>{(tile) => <ChunkBox tile={tile} band />}</For>
          </>
        )}
      </Show>
      <Show when={hover()}>{(h) => <MapTooltip hover={h()} lens={props.lens} payload={props.payload} />}</Show>
    </div>
  );
}

function MapTooltip(props: { hover: Hover; lens: Lens; payload: ChangeLensPayload }) {
  const W = 320;
  const style = (): JSX.CSSProperties => ({
    left: `${props.hover.x + W + 24 > window.innerWidth ? props.hover.x - W - 12 : props.hover.x + 14}px`,
    top: `${props.hover.y + 190 > window.innerHeight ? props.hover.y - 170 : props.hover.y + 16}px`,
    width: `${W}px`,
  });
  return (
    <div class="plc-floating pointer-events-none fixed z-50 rounded-lg border px-3 py-2 text-[12px]" style={style()} data-lens-tooltip>
      <Show when={props.hover.chunk}>
        {(chunk) => {
          const look = () => tileLook(chunk(), props.lens);
          const pair = () => chunk().metrics[props.lens.metric];
          const delta = () => (pair() && pair()!.before !== null && pair()!.after !== null ? pair()!.after! - pair()!.before! : null);
          const last = () => chunk().touches[chunk().touches.length - 1];
          return (
            <>
              <div class="flex items-baseline gap-2">
                <span class="plc-data-sm min-w-0 flex-1 break-all text-[12px] font-semibold">{chunk().name}</span>
                <span class="plc-data-sm shrink-0 tabular-nums">
                  <span class="text-[var(--plc-success)]">+{chunk().added}</span> <span class="text-[var(--plc-error)]">−{chunk().deleted}</span>
                </span>
              </div>
              <div class="plc-data-sm mt-0.5 break-all text-[var(--plc-on-subtle)]">
                {chunk().path}:{chunk().startLine}–{chunk().endLine}
              </div>
              <div class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <span class="text-[var(--plc-on-muted)]">Status</span>
                <span>
                  {STATUS_LABEL[chunk().status]}
                  <Show when={matchNote(chunk())}>{(note) => <span class="text-[var(--plc-on-subtle)]"> · {note()}</span>}</Show>
                </span>
                <Show when={chunk().touches.length}>
                  <span class="text-[var(--plc-on-muted)]">Touches</span>
                  <span>
                    {plural(chunk().touches.length, "commit")}
                    <span class="text-[var(--plc-on-subtle)]">
                      {" · last "}
                      {last().sha === WORKTREE ? "uncommitted" : (props.payload.commits.find((c) => c.sha === last().sha)?.short ?? last().sha.slice(0, 7))}
                    </span>
                  </span>
                </Show>
                <span class="text-[var(--plc-on-muted)]">{metricLabel(props.lens.metric)}</span>
                <Show
                  when={beforeAfter(props.lens.metric, chunk().measured ? pair() : undefined)}
                  fallback={<span class="text-[var(--plc-on-subtle)]">Not measured{chunk().naReason ? `: ${chunk().naReason}` : look().state === "reverted" ? ": not in base or head" : " at this scope"}</span>}
                >
                  {(text) => (
                    <span class="plc-data-sm tabular-nums">
                      {text()}
                      <Show when={delta() !== null}>
                        <span class="text-[var(--plc-on-subtle)]"> ({signed(delta()!, Number.isInteger(delta()) ? 0 : 1)})</span>
                      </Show>
                    </span>
                  )}
                </Show>
              </div>
            </>
          );
        }}
      </Show>
      <Show when={!props.hover.chunk && props.hover.file}>
        {(file) => (
          <>
            <div class="plc-data-sm break-all text-[12px] font-semibold">{file().path}</div>
            <div class="mt-0.5 text-[var(--plc-on-muted)]">
              {plural(file().loc, "line")}
              {" · "}
              <Show when={file().file} fallback="not edited in this window">
                {(f) => (
                  <>
                    {plural(f().chunkIds.length, "edited chunk")} <span class="text-[var(--plc-success)]">+{f().added}</span> <span class="text-[var(--plc-error)]">−{f().deleted}</span>
                    {f().outOfScope ? " · generated or vendored" : ""}
                  </>
                )}
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
