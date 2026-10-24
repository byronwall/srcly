import { ChevronDown, Info } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { IconButton } from "../../../components/ui/IconButton";
import { DOTTED_BOX_DASH, EDGE_OPACITY, FRONTIER_BOX_DASH, HANDOFF_EDGE_DASH } from "../encoding";

const COLLAPSED_KEY = "srcly.flowLegendCollapsed";
const SW = 30;
const SH = 14;

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

function EdgeSwatch(props: { dash?: string; accent?: boolean }) {
  const ink = () => (props.accent ? "var(--plc-accent)" : "var(--plc-tertiary)");
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <line x1="1" y1={SH / 2} x2={SW - 6} y2={SH / 2} stroke={ink()} stroke-width="1.4" stroke-opacity={EDGE_OPACITY} stroke-dasharray={props.dash} />
      <path d={`M${SW - 7},${SH / 2 - 3.2} L${SW - 0.5},${SH / 2} L${SW - 7},${SH / 2 + 3.2} z`} fill={ink()} fill-opacity={EDGE_OPACITY} />
    </svg>
  );
}

function BoxSwatch(props: { dash?: string; frame?: boolean }) {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width={SW - 3}
        height={SH - 3}
        rx="2.5"
        fill={props.frame ? "none" : "var(--plc-surface)"}
        stroke={props.frame ? "var(--plc-border)" : "var(--plc-border-strong)"}
        stroke-dasharray={props.dash}
      />
    </svg>
  );
}

const GROUPS: { title: string; items: { swatch: () => JSX.Element; label: string }[] }[] = [
  {
    title: "Edges",
    items: [
      { swatch: () => <EdgeSwatch />, label: "Renders: a component or boundary inside its parent" },
      { swatch: () => <EdgeSwatch dash={HANDOFF_EDGE_DASH} />, label: "Handoff: an origin proven to reach a render site" },
      { swatch: () => <EdgeSwatch accent />, label: "Field: the selected origin's proven path" },
    ],
  },
  {
    title: "Boxes",
    items: [
      { swatch: () => <BoxSwatch frame />, label: "Frame: what one occurrence or boundary renders" },
      { swatch: () => <BoxSwatch dash={DOTTED_BOX_DASH} />, label: "Primitive: an external or wrapper component, rolled into its frame" },
      { swatch: () => <BoxSwatch dash={FRONTIER_BOX_DASH} />, label: "Frontier: where the proof stops" },
    ],
  },
];

/** Bottom-right key to Data flow mode's encodings; collapses to an icon. */
export function FlowLegend() {
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
          <IconButton label="Show legend" size="sm" class="border border-[var(--plc-border)] bg-[var(--plc-surface)]" onClick={toggle}>
            <Info size={14} aria-hidden="true" />
          </IconButton>
        }
      >
        <div class="max-w-[19rem] rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)] py-1.5 pl-2.5 pr-1 text-[11px] text-[var(--plc-on-muted)]" role="group" aria-label="Data flow legend">
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
                        <span class="shrink-0">{item.swatch()}</span>
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
