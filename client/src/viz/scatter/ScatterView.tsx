import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { RotateCcw } from "lucide-solid";
import { metricDef, quadrantPresets } from "../../utils/metricsStore";
import { extractFilePath } from "../../utils/dataProcessing";
import { witnessOf, type CellWitness } from "../../utils/explorerColumns";
import { HotSpotRowContext } from "../../components/HotSpotItem";
import { findNodeByPath, type Node } from "../../components/Explorer";
import { Button } from "../../components/ui/Button";
import { buildPoints, groupByQuadrant, unavailableReason, type QuadrantId, type ScatterCohort, type ScatterPoint } from "./quadrants";
import ScatterPlot from "./ScatterPlot";
import QuadrantPanel from "./QuadrantPanel";

type Point = ScatterPoint<Node>;
type Cut = { x: number; y: number };

const COHORTS: { id: ScatterCohort; label: string }[] = [
  { id: "file", label: "Files" },
  { id: "function", label: "Functions" },
  { id: "component", label: "Components" },
];
/** Below this pane width the member list moves under the plot. */
const NARROW_PX = 900;

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/** Keep the 2x2 choice in the URL (replace, not push: it's a view setting, not a place). */
function writeParams(values: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(values)) params.set(k, v);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}${window.location.hash}`);
}

async function fetchFanIn(root: string): Promise<Map<string, number>> {
  const res = await fetch(`/api/analysis/fan-in?path=${encodeURIComponent(root)}`);
  if (!res.ok) return new Map();
  const body = (await res.json()) as { counts: Record<string, number> };
  return new Map(Object.entries(body.counts));
}

/**
 * The 2x2 view beside the treemap: a preset's two metrics, absolute
 * cut-offs you can drag, and four named quadrants. Points come from the
 * treemap's current scope and filters. Hover links to the explorer like a
 * treemap tile; a click opens the point's source (a file opens on the
 * function or component behind its max).
 */
export default function ScatterView(props: {
  data: Node | null;
  /** The whole scan's root: carries Git `activity` status. */
  scanRoot: Node | null;
  rootPath: string;
  onFileSelect: (path: string, startLine?: number, endLine?: number, node?: any) => void;
  onZoom: (node: any) => void;
}) {
  const [presetId, setPresetId] = createSignal(readParam("preset") ?? "activity");
  const preset = createMemo(() => quadrantPresets().find((p) => p.id === presetId()) ?? quadrantPresets()[0]);
  const [cohortPick, setCohortPick] = createSignal(readParam("cohort") as ScatterCohort | null);
  const cohort = createMemo<ScatterCohort>(() => {
    const pick = cohortPick();
    return pick && preset()?.cohorts.includes(pick) ? pick : (preset()?.cohorts[0] ?? "file");
  });
  const [selected, setSelected] = createSignal<QuadrantId>((readParam("quadrant") as QuadrantId) ?? "high_both");
  /** Dragged cut-offs per preset; absent means the catalog default. */
  const [moved, setMoved] = createSignal<Record<string, Cut>>({});
  const cut = createMemo<Cut>(() => {
    const p = preset();
    if (!p) return { x: 1, y: 1 };
    return moved()[p.id] ?? { x: p.x.cutoff, y: p.y.cutoff };
  });
  createEffect(() => writeParams({ preset: preset()?.id ?? "", cohort: cohort(), quadrant: selected() }));

  // Fan-in comes from the dependency graph: fetched once per root, only for presets that plot it.
  const needsFanIn = () => Boolean(preset() && [preset()!.x.id, preset()!.y.id].includes("fan_in"));
  const [fanIn] = createResource(() => (needsFanIn() && props.rootPath ? props.rootPath : null), fetchFanIn);

  const built = createMemo(() => {
    const p = preset();
    if (!p || !props.data) return { points: [] as Point[], na: 0 };
    return buildPoints(props.data, p, cohort(), needsFanIn() ? (fanIn() ?? null) : null);
  });
  const groups = createMemo(() => groupByQuadrant(built().points, cut().x, cut().y));
  const counts = createMemo(() => {
    const g = groups();
    return { high_both: g.high_both.length, high_x: g.high_x.length, high_y: g.high_y.length, low_both: g.low_both.length };
  });
  const unavailable = createMemo(() => {
    const p = preset();
    if (!p) return "No presets in the metric catalog";
    return unavailableReason(p, built().points.length, {
      activity: (props.scanRoot as { activity?: { status: string; reason: string } } | null)?.activity ?? null,
      fanIn: fanIn() ?? null,
      fanInLoading: needsFanIn() && fanIn.loading,
    });
  });

  let rootRef: HTMLDivElement | undefined;
  const [narrow, setNarrow] = createSignal(false);
  onMount(() => {
    if (!rootRef) return;
    const observer = new ResizeObserver((entries) => setNarrow((entries[entries.length - 1]?.contentRect.width ?? 0) < NARROW_PX));
    observer.observe(rootRef);
    onCleanup(() => observer.disconnect());
  });

  // --- Opening sources --------------------------------------------------------------
  /** The witnessed axis metric (complexity, component LOC…) whose function a file opens on. */
  const witnessMetric = () => {
    const p = preset();
    const axis = p && [p.x, p.y].find((a) => !a.derived && metricDef(a.id)?.witness);
    return axis?.id ?? "complexity";
  };
  const openWitness = (w: CellWitness) => {
    const node = props.data ? findNodeByPath(props.data, w.path) : null;
    props.onFileSelect(w.path.split("::")[0], w.start_line > 0 ? w.start_line : undefined, w.end_line > 0 ? w.end_line : undefined, node ?? undefined);
  };
  const openPoint = ({ node }: Point) => {
    const w = node.type === "file" ? witnessOf(node, witnessMetric()) : null;
    if (w) return openWitness(w);
    const file = extractFilePath(node.path, node.type);
    if (!file) return;
    const line = (n?: number) => (n && n > 0 ? n : undefined);
    props.onFileSelect(file, line(node.start_line), line(node.end_line), node);
  };

  const noun = () => (cohort() === "file" ? "files" : cohort() === "component" ? "components" : "functions");

  return (
    <HotSpotRowContext.Provider
      value={{
        onSelect: props.onFileSelect,
        onOpenWitness: openWitness,
        onZoom: props.onZoom,
        get rootData() {
          return props.data;
        },
      }}
    >
      <div ref={rootRef} class="flex h-full w-full flex-col bg-[var(--plc-surface)]">
        <div class="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--plc-border)] px-2 scrollbar-hide">
          <div role="radiogroup" aria-label="2x2 preset" class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
            <For each={quadrantPresets()}>
              {(p) => (
                <Button
                  variant="tab"
                  size="xs"
                  role="radio"
                  aria-checked={preset()?.id === p.id}
                  active={preset()?.id === p.id}
                  class="h-6 px-2"
                  title={`${p.x.label} × ${p.y.label}. ${p.description}`}
                  onClick={() => setPresetId(p.id)}
                >
                  {p.label}
                </Button>
              )}
            </For>
          </div>
          <div role="radiogroup" aria-label="Points" class="flex shrink-0 rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface-muted)] p-0.5">
            <For each={COHORTS.filter((c) => c.id !== "component" || preset()?.cohorts.includes("component"))}>
              {(c) => {
                const enabled = () => Boolean(preset()?.cohorts.includes(c.id));
                return (
                  <Button
                    variant="tab"
                    size="xs"
                    role="radio"
                    aria-checked={cohort() === c.id}
                    active={cohort() === c.id}
                    disabled={!enabled()}
                    class="h-6 px-2"
                    title={enabled() ? `One point per ${c.id}` : preset()?.cohort_note}
                    onClick={() => setCohortPick(c.id)}
                  >
                    {c.label}
                  </Button>
                );
              }}
            </For>
          </div>
          <span class="plc-data-sm min-w-0 flex-1 truncate text-[var(--plc-on-subtle)]" title={preset()?.description}>
            {built().points.length.toLocaleString("en-US")} {noun()} plotted
            <Show when={built().na > 0}>
              <span title={`No ${preset()?.x.label} or no ${preset()?.y.label} value: it doesn't apply to their language or kind, or they were skipped`}>
                {` · ${built().na.toLocaleString("en-US")} N/A not plotted`}
              </span>
            </Show>
          </span>
          <Button
            variant="ghost"
            size="xs"
            class="h-6 shrink-0 px-1.5"
            disabled={!preset() || !moved()[preset()!.id]}
            title="Put both cut-offs back on their catalog defaults"
            onClick={() => setMoved(({ [preset()!.id]: _, ...rest }) => rest)}
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset cut-offs
          </Button>
        </div>

        <Show when={preset()}>
          {(p) => (
            <div class="flex min-h-0 flex-1" classList={{ "flex-col": narrow() }}>
              <ScatterPlot
                preset={p()}
                points={built().points}
                counts={counts()}
                cut={cut()}
                onCutChange={(next) => setMoved((all) => ({ ...all, [p().id]: next }))}
                selected={selected()}
                onSelect={setSelected}
                onOpen={openPoint}
                unavailable={unavailable()}
                loading={needsFanIn() && fanIn.loading ? "Reading the import graph…" : undefined}
                rootPath={props.rootPath}
              />
              <QuadrantPanel
                preset={p()}
                groups={groups()}
                selected={selected()}
                onSelect={setSelected}
                cut={cut()}
                cohort={cohort()}
                witnessMetric={witnessMetric()}
                emptyText={unavailable()}
                classList={{ "w-[400px] border-l": !narrow(), "h-[45%] border-t": narrow() }}
              />
            </div>
          )}
        </Show>
      </div>
    </HotSpotRowContext.Provider>
  );
}
