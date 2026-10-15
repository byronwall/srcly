import { ChevronRight } from "lucide-solid";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { CheckboxRow } from "../components/ui/CheckboxRow";
import { cx } from "../components/ui/classes";
import { TREEMAP_RAMP, treemapFillColor } from "../viz/treemap/utils/colors";
import { DiffStat, StatusIcon } from "./bits";
import { compareMetricLabel, formatDelta, formatValue, STATUS_COLOR, STATUS_LABEL, VERDICT_TEXT } from "./metrics";
import { collectFiles, indexFiles } from "./rows";
import { layoutCompareTreemap, type FileTile, type SideName } from "./treemapLayout";
import type { ComparePayload, Verdict } from "./types";

const OUTLINE: Record<Verdict, string | null> = {
  worse: "var(--plc-error)",
  better: "var(--plc-success)",
  neutral: null,
  same: null,
};

function Pane(props: {
  side: SideName;
  title: string;
  subtitle: string;
  layout: ReturnType<typeof layoutCompareTreemap>;
  width: number;
  height: number;
  metric: string;
  selected: string | null;
  hovered: string | null;
  onHover: (path: string | null, e?: MouseEvent) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onZoom: (path: string) => void;
}) {
  const hatch = `hatch-${props.side}`;
  return (
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-8 shrink-0 items-baseline gap-2 px-1">
        <span class="plc-label-caps text-[var(--plc-on-subtle)]">{props.title}</span>
        <span class="plc-data-sm truncate text-[var(--plc-on-muted)]">{props.subtitle}</span>
      </div>
      <svg width={props.width} height={props.height} class="compare-treemap-pane block select-none rounded-md bg-[var(--plc-surface)]">
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--plc-surface-subtle)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--plc-border-strong)" stroke-width="1.5" />
          </pattern>
        </defs>
        <For each={props.layout.folders}>
          {(folder) => (
            <g>
              <rect
                x={folder.rect.x0}
                y={folder.rect.y0}
                width={Math.max(0, folder.rect.x1 - folder.rect.x0)}
                height={Math.max(0, folder.rect.y1 - folder.rect.y0)}
                fill="var(--plc-surface-subtle)"
                stroke="var(--plc-border)"
                rx="2"
              />
              <Show when={folder.header}>
                <text
                  x={folder.rect.x0 + 5}
                  y={folder.rect.y0 + 12.5}
                  class="cursor-pointer fill-[var(--plc-on-muted)] text-[11px] font-medium hover:fill-[var(--plc-accent)]"
                  onClick={() => props.onZoom(folder.path)}
                >
                  {clip(`${folder.name}/`, folder.rect.x1 - folder.rect.x0 - 10)}
                </text>
              </Show>
            </g>
          )}
        </For>
        <For each={props.layout.files}>
          {(tile) => {
            const side = () => tile.sides[props.side];
            const w = () => Math.max(0, tile.rect.x1 - tile.rect.x0);
            const h = () => Math.max(0, tile.rect.y1 - tile.rect.y0);
            const verdict = () => (props.side === "head" ? tile.change?.deltas[props.metric]?.verdict : undefined);
            const outline = () => {
              if (props.selected === tile.path) return "var(--plc-accent)";
              if (props.hovered === tile.path) return "var(--plc-on-surface)";
              return verdict() ? OUTLINE[verdict()!] : null;
            };
            return (
              <g
                class="cursor-pointer"
                onMouseMove={(e) => props.onHover(tile.path, e)}
                onMouseLeave={() => props.onHover(null)}
                onClick={() => props.onSelect(tile.path)}
                onDblClick={() => props.onOpen(tile.path)}
              >
                {/* The slot: the file's footprint on either side. */}
                <rect
                  x={tile.rect.x0}
                  y={tile.rect.y0}
                  width={w()}
                  height={h()}
                  fill={side() ? "var(--plc-surface-muted)" : `url(#${hatch})`}
                  stroke="var(--plc-surface)"
                  stroke-width="1"
                />
                <Show when={side()}>
                  {(s) => (
                    <rect
                      x={s().fill.x0}
                      y={s().fill.y0}
                      width={Math.max(0, s().fill.x1 - s().fill.x0)}
                      height={Math.max(0, s().fill.y1 - s().fill.y0)}
                      fill={tile.status === "unchanged" ? "var(--plc-surface-muted)" : treemapFillColor(props.metric, s().metrics, 0)}
                      opacity={tile.status === "unchanged" ? 0.9 : 1}
                    />
                  )}
                </Show>
                <Show when={outline()}>
                  <rect
                    x={tile.rect.x0 + 1}
                    y={tile.rect.y0 + 1}
                    width={Math.max(0, w() - 2)}
                    height={Math.max(0, h() - 2)}
                    fill="none"
                    stroke={outline()!}
                    stroke-width={props.selected === tile.path ? 2.5 : 1.5}
                    pointer-events="none"
                  />
                </Show>
                <Show when={w() > 36 && h() > 15}>
                  <text
                    x={tile.rect.x0 + 4}
                    y={tile.rect.y0 + 12}
                    pointer-events="none"
                    class={cx(
                      "text-[11px]",
                      tile.status === "unchanged" ? "fill-[var(--plc-on-subtle)]" : "fill-[var(--plc-on-surface)]",
                      !side() && "fill-[var(--plc-on-subtle)]"
                    )}
                    text-decoration={!side() ? "line-through" : undefined}
                  >
                    {clip(tile.name, w() - 8)}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
}

/** Rough text clip by character width; the hover card always has the full name. */
function clip(text: string, width: number): string {
  const max = Math.floor(width / 6.2);
  if (max <= 1) return "";
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

/** A side's value, or "new" / "gone" when the file is missing on that side. */
function sideText(metric: string, tile: FileTile, side: SideName): string {
  const s = tile.sides[side];
  if (!s) return side === "base" ? "new" : "gone";
  return formatValue(metric, s.metrics[metric] ?? 0);
}

function HoverCard(props: { tile: FileTile; metric: string; x: number; y: number }) {
  const d = () => props.tile.change?.deltas[props.metric];
  return (
    <div
      class="plc-floating pointer-events-none fixed z-50 w-72 rounded-lg border px-3 py-2 text-[12px]"
      // Flip to stay on screen near the right and bottom edges.
      style={{
        left: `${props.x + 300 > window.innerWidth ? props.x - 302 : props.x + 14}px`,
        top: `${props.y + 160 > window.innerHeight ? props.y - 150 : props.y + 14}px`,
      }}
    >
      <div class="flex items-center gap-1.5">
        <Show when={props.tile.status !== "unchanged"} fallback={<span class="text-[11px] text-[var(--plc-on-subtle)]">Unchanged</span>}>
          <StatusIcon status={props.tile.status as Exclude<FileTile["status"], "unchanged">} />
          <span class="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: STATUS_COLOR[props.tile.status as keyof typeof STATUS_COLOR] }}>
            {STATUS_LABEL[props.tile.status as keyof typeof STATUS_LABEL]}
          </span>
        </Show>
        <Show when={props.tile.change}>
          {(c) => (
            <span class="ml-auto">
              <DiffStat additions={c().additions} deletions={c().deletions} blocks={false} />
            </span>
          )}
        </Show>
      </div>
      <div class="plc-data-sm mt-1 break-all text-[var(--plc-on-surface)]">{props.tile.path}</div>
      <div class="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
        <span class="text-[var(--plc-on-muted)]">LOC</span>
        <span class="plc-data-sm text-[var(--plc-on-subtle)]">
          {sideText("loc", props.tile, "base")} → {sideText("loc", props.tile, "head")}
        </span>
        <span />
        <Show when={props.metric !== "loc"}>
          <span class="text-[var(--plc-on-muted)]">{compareMetricLabel(props.metric)}</span>
          <span class="plc-data-sm text-[var(--plc-on-subtle)]">
            {sideText(props.metric, props.tile, "base")} → {sideText(props.metric, props.tile, "head")}
          </span>
          <span class={cx("plc-data-sm font-semibold", d() ? VERDICT_TEXT[d()!.verdict] : "")}>
            {d() && d()!.before !== null && d()!.after !== null && d()!.verdict !== "same" ? formatDelta(props.metric, d()!.delta) : ""}
          </span>
        </Show>
      </div>
      <div class="mt-1.5 text-[11px] text-[var(--plc-on-subtle)]">Click to inspect · double-click to open</div>
    </div>
  );
}

/**
 * Before and after treemaps drawn from one shared layout: every file keeps its
 * place on both sides, each side fills the tile to its own size, and a file
 * missing on a side leaves a hatched slot.
 */
export function CompareTreemap(props: {
  payload: ComparePayload;
  metric: string;
  onMetricChange: (metric: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [showUnchanged, setShowUnchanged] = createSignal(false);
  const [zoom, setZoom] = createSignal("");
  const [hover, setHover] = createSignal<{ path: string; x: number; y: number } | null>(null);
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  let container: HTMLDivElement | undefined;

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Two panes side by side with a gutter; each has a 32px title row.
      setSize({ width: Math.max(0, Math.floor((width - 16) / 2)), height: Math.max(0, Math.floor(height - 32)) });
    });
    if (container) observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  const rows = createMemo(() => collectFiles(props.payload.files, indexFiles(props.payload.trees?.head), showUnchanged()));
  const layout = createMemo(() =>
    size().width ? layoutCompareTreemap(rows(), size(), zoom()) : { files: [], folders: [] }
  );
  const tileByPath = createMemo(() => new Map(layout().files.map((f) => [f.path, f])));
  const metrics = createMemo(() =>
    props.payload.metrics
      .filter((m) => m.source === "tree" && m.direction !== "neutral" && props.payload.summary.metrics[m.name])
      .map((m) => m.name)
  );
  const crumbs = createMemo(() => {
    const parts = zoom() ? zoom().split("/") : [];
    return [{ label: props.payload.repo.name, path: "" }, ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join("/") }))];
  });
  const onHover = (path: string | null, e?: MouseEvent) =>
    setHover(path && e ? { path, x: e.clientX, y: e.clientY } : null);

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="plc-toolbar flex shrink-0 items-center gap-4 border-b px-3">
        <nav class="flex min-w-0 items-center gap-0.5 text-[13px]" aria-label="Zoom">
          <For each={crumbs()}>
            {(crumb, i) => (
              <>
                <Show when={i() > 0}>
                  <ChevronRight size={12} class="shrink-0 text-[var(--plc-on-disabled)]" />
                </Show>
                <button
                  type="button"
                  class={cx(
                    "rounded px-1 transition-colors duration-150 hover:bg-[var(--plc-surface-hover)]",
                    i() === crumbs().length - 1 ? "font-semibold text-[var(--plc-on-surface)]" : "text-[var(--plc-accent)]"
                  )}
                  onClick={() => setZoom(crumb.path)}
                >
                  {crumb.label}
                </button>
              </>
            )}
          </For>
        </nav>
        <label class="ml-auto flex items-center gap-2 text-xs text-[var(--plc-on-muted)]">
          Color
          <select
            class="h-7 rounded-md border border-[var(--plc-border-strong)] bg-[var(--plc-surface)] px-1.5 text-xs text-[var(--plc-on-surface)] outline-none focus:border-[var(--plc-border-focus)]"
            value={props.metric}
            onChange={(e) => props.onMetricChange(e.currentTarget.value)}
          >
            <For each={metrics()}>{(m) => <option value={m}>{compareMetricLabel(m)}</option>}</For>
          </select>
        </label>
        <span class="flex items-center gap-1.5 text-[11px] text-[var(--plc-on-subtle)]" aria-hidden="true">
          low
          <span
            class="h-2 w-16 rounded-sm"
            style={{ background: `linear-gradient(90deg, ${TREEMAP_RAMP.join(", ")})` }}
          />
          high
        </span>
        <span class="flex items-center gap-3 text-[11px] text-[var(--plc-on-subtle)]">
          <span class="flex items-center gap-1">
            <span class="h-2.5 w-2.5 rounded-sm border-[1.5px] border-[var(--plc-error)]" />
            worse
          </span>
          <span class="flex items-center gap-1">
            <span class="h-2.5 w-2.5 rounded-sm border-[1.5px] border-[var(--plc-success)]" />
            better
          </span>
        </span>
        <CheckboxRow label="Unchanged neighbors" checked={showUnchanged()} onChange={setShowUnchanged} />
      </div>
      <p class="shrink-0 px-3 pt-2 text-[11px] text-[var(--plc-on-subtle)]">
        Each file keeps one tile on both sides. The filled part is that side's size; hatched means the file doesn't exist
        there. Outlines on the right mark files where {compareMetricLabel(props.metric).toLowerCase()} got worse or better.
      </p>
      <div ref={container} class="flex min-h-0 flex-1 gap-4 px-3 pb-3 pt-1">
        <Show when={size().width}>
          <For each={["base", "head"] as SideName[]}>
            {(side) => (
              <Pane
                side={side}
                title={side === "base" ? "Before" : "After"}
                subtitle={side === "base" ? props.payload.base.label : props.payload.head.label}
                layout={layout()}
                width={size().width}
                height={size().height}
                metric={props.metric}
                selected={props.selected}
                hovered={hover()?.path ?? null}
                onHover={onHover}
                onSelect={props.onSelect}
                onOpen={props.onOpenFile}
                onZoom={setZoom}
              />
            )}
          </For>
        </Show>
      </div>
      <Show when={hover() && tileByPath().get(hover()!.path)}>
        {(tile) => <HoverCard tile={tile()} metric={props.metric} x={hover()!.x} y={hover()!.y} />}
      </Show>
    </div>
  );
}
