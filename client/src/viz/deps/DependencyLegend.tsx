import { ChevronDown, Info } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { IconButton } from "../../components/ui/IconButton";
import {
  CONTEXT_EDGE_DASH,
  CONTEXT_EDGE_OPACITY,
  EDGE_OPACITY,
  edgeStrokeWidth,
  EXTERNAL_BOX_DASH,
} from "./encoding";
import { TREEMAP_RAMP, rampColor } from "../treemap/utils/colors";
import { CycleIcon, FlowIcon, HubGlyph } from "./DependencyCanvas";
import { HUB_STYLES } from "./hubs";

const COLLAPSED_KEY = "srcly.depsLegendCollapsed";

function readCollapsed(): boolean {
  try {
    // Collapsed until opened once: open, it covers boxes in the corner.
    return window.localStorage.getItem(COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Remembering the legend state is a convenience only.
  }
}

const SW = 30;
const SH = 14;

function EdgeSwatch(props: { width: number; dash?: string; opacity: number }) {
  const y = SH / 2;
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <line
        x1="1"
        y1={y}
        x2={SW - 6}
        y2={y}
        stroke="var(--plc-tertiary)"
        stroke-width={props.width}
        stroke-opacity={props.opacity}
        stroke-dasharray={props.dash}
      />
      <path d={`M${SW - 7},${y - 3.2} L${SW - 0.5},${y} L${SW - 7},${y + 3.2} z`} fill="var(--plc-tertiary)" fill-opacity={props.opacity} />
    </svg>
  );
}

function ExternalSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width={SW - 3}
        height={SH - 3}
        rx="2.5"
        fill="var(--plc-surface)"
        stroke="var(--plc-border-strong)"
        stroke-dasharray={EXTERNAL_BOX_DASH}
      />
    </svg>
  );
}

/** A mutual import: two arrows chasing each other. */
function CycleSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <CycleIcon x={6} y={SH / 2} />
    </svg>
  );
}

/** Package frame around neighbors from one folder. */
/** A package frame; an opened folder's frame has an accent border and a "−" to close it. */
function FrameSwatch(props: { opened?: boolean }) {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="0.5" y="0.5" width={SW - 1} height={SH - 1} rx="3" fill="var(--plc-surface)" stroke={props.opened ? "var(--plc-accent-border)" : "var(--plc-border-strong)"} />
      <rect x="4" y="4.5" width={SW - 8} height="5" rx="1.5" fill="var(--plc-surface-muted)" stroke="var(--plc-border-strong)" stroke-width="0.75" />
    </svg>
  );
}

/** Box fill: the treemap's color ramp. */
function FillSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <For each={TREEMAP_RAMP}>
        {(c, i) => <rect x={1 + i() * ((SW - 2) / TREEMAP_RAMP.length)} y="2" width={(SW - 2) / TREEMAP_RAMP.length} height={SH - 4} fill={c} />}
      </For>
    </svg>
  );
}

/** A folder's contents strip: children by LOC, on a white track. */
function StripSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="1" y="4.5" width={SW - 2} height="5" rx="2" fill="var(--plc-surface)" stroke="var(--plc-border)" stroke-width="0.5" />
      <For each={[[0, 11, 0.85], [11, 8, 0.6], [19, 5, 0.3], [24, 4, 0.1]] as const}>
        {([x, w, t]) => <rect x={1.5 + x} y="5" width={w - 1} height="4" rx="1.2" fill={rampColor(t)} />}
      </For>
    </svg>
  );
}

/** Blue: what you're working with (focus, selection, hover). */
function AccentSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="2" y="2" width={SW - 4} height={SH - 4} rx="2.5" fill="var(--plc-surface)" stroke="var(--plc-accent)" stroke-width="1.75" />
    </svg>
  );
}

/** The hub badges, side by side. */
function HubSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <For each={HUB_STYLES.slice(0, 3)}>{(h, i) => <HubGlyph shape={h.shape} color={h.color} x={5 + i() * 10} y={SH / 2} r={3.8} />}</For>
    </svg>
  );
}

/** Row 3 of a box: links in, links out. */
function FlowSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true" class="text-[var(--plc-on-muted)]">
      <FlowIcon dir="in" x={0} y={11} />
      <FlowIcon dir="out" x={15} y={11} />
    </svg>
  );
}

/** The metric bar: how far along the treemap's ramp a box sits. */
function MetricSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="1" y="4.5" width={SW - 2} height="5" rx="2.5" fill="var(--plc-surface-muted)" stroke="var(--plc-border)" stroke-width="0.5" />
      <rect x="1" y="4.5" width={(SW - 2) * 0.7} height="5" rx="2.5" fill={rampColor(0.7)} />
    </svg>
  );
}

const GROUPS: { title: string; items: { swatch: () => JSX.Element; label: string }[] }[] = [
  {
    title: "Color",
    items: [
      { swatch: () => <FillSwatch />, label: "Tint: the color metric, on the treemap's scale" },
      { swatch: () => <MetricSwatch />, label: "Bar: that metric's value" },
      { swatch: () => <StripSwatch />, label: "Strip: what a folder holds, sized by LOC, colored by the metric" },
      { swatch: () => <AccentSwatch />, label: "Blue: the focus, the selection and hovered edges" },
    ],
  },
  {
    title: "Marks",
    items: [
      { swatch: () => <FlowSwatch />, label: "Boxes importing it · boxes it imports (bold: the busiest)" },
      { swatch: () => <HubSwatch />, label: "Hub: most boxes import it; importers show its shape. Hover for edges" },
      { swatch: () => <CycleSwatch />, label: "Mutual import with a box in view" },
      { swatch: () => <ExternalSwatch />, label: "External package" },
    ],
  },
  {
    title: "Edges and frames",
    items: [
      { swatch: () => <EdgeSwatch width={edgeStrokeWidth(1, false)} opacity={EDGE_OPACITY} />, label: "Imports (arrow points at the dependency)" },
      { swatch: () => <EdgeSwatch width={edgeStrokeWidth(8, false)} opacity={EDGE_OPACITY} />, label: "Thicker: more import links" },
      {
        swatch: () => <EdgeSwatch width={edgeStrokeWidth(1, true)} dash={CONTEXT_EDGE_DASH} opacity={CONTEXT_EDGE_OPACITY} />,
        label: "Context: between neighbors, or inside the focus",
      },
      { swatch: () => <FrameSwatch />, label: "Neighbors from one package" },
      { swatch: () => <FrameSwatch opened />, label: "Opened folder: its title closes it" },
    ],
  },
];

/** Bottom-right key to the graph's visual encodings; collapses to an icon. */
export function DependencyLegend() {
  const [collapsed, setCollapsed] = createSignal(readCollapsed());
  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    writeCollapsed(next);
  };

  return (
    <div class="pointer-events-auto absolute bottom-3 right-3 z-10">
      <Show
        when={!collapsed()}
        fallback={
          <IconButton
            label="Show legend"
            size="sm"
            class="border border-[var(--plc-border)] bg-[var(--plc-surface)]"
            onClick={toggle}
          >
            <Info size={14} aria-hidden="true" />
          </IconButton>
        }
      >
        <div
          class="rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)] py-1.5 pl-2.5 pr-1 text-[11px] text-[var(--plc-on-muted)]"
          role="group"
          aria-label="Graph legend"
        >
          <div class="flex items-center justify-between gap-3 pb-0.5">
            <span class="font-semibold text-[var(--plc-on-surface)]">Legend</span>
            <IconButton label="Hide legend" size="xs" onClick={toggle}>
              <ChevronDown size={13} aria-hidden="true" />
            </IconButton>
          </div>
          <For each={GROUPS}>
            {(group, gi) => (
              <section classList={{ "mt-1.5": gi() > 0 }}>
                <h4 class="pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">{group.title}</h4>
                <ul class="space-y-1 pr-1.5">
                  <For each={group.items}>
                    {(item) => (
                      <li class="flex items-center gap-2">
                        {item.swatch()}
                        <span>{item.label}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
