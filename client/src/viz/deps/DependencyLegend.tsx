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
import { TREEMAP_RAMP } from "../treemap/utils/colors";

const COLLAPSED_KEY = "srcly.depsLegendCollapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
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

/** Folder box: heavier frame and a size bar along the bottom. */
function FolderSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="1" y="1" width={SW - 2} height={SH - 2} rx="2.5" fill="var(--plc-surface-muted)" stroke="var(--plc-on-disabled)" stroke-width="1.5" />
      <rect x="2.5" y={SH - 4.5} width={(SW - 5) * 0.65} height="2" rx="1" fill="var(--plc-tertiary)" fill-opacity="0.45" />
    </svg>
  );
}

/** Package frame around neighbors from one folder. */
function FrameSwatch() {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="0.5" y="0.5" width={SW - 1} height={SH - 1} rx="3" fill="var(--plc-surface)" stroke="var(--plc-border-strong)" />
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

const ITEMS: { swatch: () => JSX.Element; label: string }[] = [
  { swatch: () => <EdgeSwatch width={edgeStrokeWidth(1, false)} opacity={EDGE_OPACITY} />, label: "Imports (arrow points at the dependency)" },
  { swatch: () => <EdgeSwatch width={edgeStrokeWidth(8, false)} opacity={EDGE_OPACITY} />, label: "Thicker: more import links" },
  {
    swatch: () => <EdgeSwatch width={edgeStrokeWidth(1, true)} dash={CONTEXT_EDGE_DASH} opacity={CONTEXT_EDGE_OPACITY} />,
    label: "Context: between neighbors, or inside the focus",
  },
  { swatch: () => <ExternalSwatch />, label: "External package" },
  { swatch: () => <FolderSwatch />, label: "Folder; the bar shows its size (LOC)" },
  { swatch: () => <FrameSwatch />, label: "Neighbors from one package" },
  { swatch: () => <FillSwatch />, label: "Fill: the treemap's color metric" },
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
          <ul class="space-y-1 pr-1.5">
            <For each={ITEMS}>
              {(item) => (
                <li class="flex items-center gap-2">
                  {item.swatch()}
                  <span>{item.label}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
