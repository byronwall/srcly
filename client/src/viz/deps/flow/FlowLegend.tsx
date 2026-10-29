import { ChevronDown, Info } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { IconButton } from "../../../components/ui/IconButton";
import { DOTTED_BOX_DASH, EDGE_OPACITY, FRONTIER_BOX_DASH, HANDOFF_EDGE_DASH, STRUCTURAL_EDGE_DASH } from "../encoding";
import { FlowMarkGlyph, RepetitionBadge } from "./FlowMark";
import { FLOW_MARK_ORDER, FLOW_MARKS, REPETITION_BADGE, markVar, type FlowMark } from "./marks";

const COLLAPSED_KEY = "srcly.flowLegendCollapsed";
const SW = 30;
const SH = 14;

function readCollapsed(): boolean {
  try {
    // Collapsed until opened once: the inspector rail carries the words, and open it covers boxes.
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

function EdgeSwatch(props: { dash?: string; accent?: boolean; muted?: boolean }) {
  const ink = () => (props.accent ? "var(--plc-accent)" : props.muted ? "var(--plc-on-disabled)" : "var(--plc-tertiary)");
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <line x1="1" y1={SH / 2} x2={SW - 6} y2={SH / 2} stroke={ink()} stroke-width="1.4" stroke-opacity={EDGE_OPACITY} stroke-dasharray={props.dash} />
      <path d={`M${SW - 7},${SH / 2 - 3.2} L${SW - 0.5},${SH / 2} L${SW - 7},${SH / 2 + 3.2} z`} fill={ink()} fill-opacity={EDGE_OPACITY} />
    </svg>
  );
}

/** A box as the canvas draws it: `stroke` is a status or selection color, `frame` a group frame. */
function BoxSwatch(props: { dash?: string; frame?: boolean; stroke?: string; width?: number }) {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width={SW - 3}
        height={SH - 3}
        rx="2.5"
        fill={props.frame ? "none" : "var(--plc-surface)"}
        stroke={props.stroke ?? (props.frame ? "var(--plc-border)" : "var(--plc-border-strong)")}
        stroke-width={props.width ?? 1}
        stroke-dasharray={props.dash}
      />
    </svg>
  );
}

/** The kind's mark in a swatch, with its tint behind it like a box. */
function MarkSwatch(props: { mark: keyof typeof FLOW_MARKS }) {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="1.5" y="0.5" width={SW - 3} height={SH - 1} rx="2.5" fill={markVar(props.mark)} fill-opacity="0.16" stroke="var(--plc-border-strong)" />
      <FlowMarkGlyph mark={props.mark} x={SW / 2 - 6} y={1} />
    </svg>
  );
}

function BadgeSwatch(props: { repetition: keyof typeof REPETITION_BADGE }) {
  return (
    <svg width={SW} height={SH + 2} viewBox={`0 0 ${SW} ${SH + 2}`} aria-hidden="true">
      <RepetitionBadge repetition={props.repetition} x={SW / 2} y={SH / 2 + 1} />
    </svg>
  );
}

/** A key or gesture, in the swatch column. */
function KeySwatch(props: { keys: string }) {
  return <kbd class="inline-block min-w-[30px] rounded border border-[var(--plc-border-strong)] px-1 text-center font-mono text-[10px] leading-[14px] text-[var(--plc-on-surface)]">{props.keys}</kbd>;
}

const KEYS: [keys: string, label: string][] = [
  ["Click", "Light a box's reach; R cycles both, up, down"],
  ["O", "Open the box's code (or double-click)"],
  ["E", "Open or close a frame (or Shift-click)"],
  ["0", "Fit the graph to the window"],
  ["I", "Show or hide the inspector"],
  ["/", "Pick a route"],
  ["Esc", "Clear the selection"],
];

type Group = { title: string; items: { swatch: () => JSX.Element; label: string }[] };

const markItem = (mark: FlowMark, hint = FLOW_MARKS[mark].hint) => ({
  swatch: () => <MarkSwatch mark={mark} />,
  label: `${FLOW_MARKS[mark].label[0].toUpperCase()}${FLOW_MARKS[mark].label.slice(1)}: ${hint}`,
});

/** Anchor mode traces values, in either language: no routes, components, render frames or repetition badges. */
const ANCHOR_GROUPS: Group[] = [
  {
    title: "Keys",
    items: KEYS.filter(([keys]) => keys !== "/").map(([keys, label]) => ({ swatch: () => <KeySwatch keys={keys} />, label })),
  },
  {
    title: "Marks",
    items: [
      markItem("anchor"),
      markItem("origin", "where a value enters: a request, a file, the environment, a database read"),
      markItem("value"),
      markItem("transform", "a step that reshapes the value: a call, a constructor, a packed object"),
      markItem("terminal", "where a value ends: a response, a write, a return, a branch test"),
      markItem("boundary"),
      markItem("frontier"),
    ],
  },
  {
    title: "Edges",
    items: [
      { swatch: () => <EdgeSwatch />, label: "Flow: the value moves to the next box" },
      { swatch: () => <EdgeSwatch dash={HANDOFF_EDGE_DASH} />, label: "Crosses a call: an argument, a return or a binding" },
      { swatch: () => <EdgeSwatch dash={STRUCTURAL_EDGE_DASH} muted />, label: "Structural: found by structure, not traced" },
    ],
  },
  {
    title: "Boxes",
    items: [
      { swatch: () => <BoxSwatch frame />, label: "Frame: one function, class or module" },
      { swatch: () => <BoxSwatch stroke="var(--plc-warning)" width={1.5} />, label: "Partial: the engine omitted some of what is inside" },
      { swatch: () => <BoxSwatch stroke="var(--plc-error)" width={1.5} />, label: "Unsupported: not analyzed; the box says why" },
    ],
  },
];

const GROUPS: Group[] = [
  {
    title: "Keys",
    items: KEYS.map(([keys, label]) => ({ swatch: () => <KeySwatch keys={keys} />, label })),
  },
  {
    title: "Marks",
    items: FLOW_MARK_ORDER.map((mark) => markItem(mark)),
  },
  {
    title: "Edges",
    items: [
      { swatch: () => <EdgeSwatch />, label: "Renders: a component or boundary inside its parent" },
      { swatch: () => <EdgeSwatch dash={HANDOFF_EDGE_DASH} />, label: "Handoff: an origin proven to reach a render site" },
      { swatch: () => <EdgeSwatch accent />, label: "Field: the selected origin's proven path" },
      { swatch: () => <EdgeSwatch dash={STRUCTURAL_EDGE_DASH} muted />, label: "Structural: found by structure, not traced" },
    ],
  },
  {
    title: "Boxes",
    items: [
      { swatch: () => <BoxSwatch frame />, label: "Frame: what one occurrence or boundary renders" },
      { swatch: () => <BoxSwatch dash={DOTTED_BOX_DASH} />, label: "Primitive: an external or wrapper component, rolled into its frame" },
      { swatch: () => <BoxSwatch stroke="var(--plc-warning)" width={1.5} />, label: "Partial: the engine omitted some of what is inside" },
      { swatch: () => <BoxSwatch stroke="var(--plc-error)" width={1.5} />, label: "Unsupported: not analyzed; the box says why" },
      { swatch: () => <BoxSwatch stroke="var(--plc-accent)" width={2} />, label: "Lit: a proven destination of the selected origin" },
      { swatch: () => <BoxSwatch dash={FRONTIER_BOX_DASH} stroke="var(--plc-warning)" />, label: "Frontier: where the selected origin's proof stops" },
    ],
  },
  {
    title: "Badges",
    items: (["conditional", "collection"] as const).map((r) => ({
      swatch: () => <BadgeSwatch repetition={r} />,
      label: `${REPETITION_BADGE[r].title}: ${REPETITION_BADGE[r].hint}`,
    })),
  },
];

/** Bottom-right key to Data flow mode's encodings; collapses to an icon. Route mode draws renders; anchor mode traces values. */
export function FlowLegend(props: { mode: "route" | "anchor" }) {
  const [collapsed, setCollapsed] = createSignal(readCollapsed());
  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    writeCollapsed(next);
  };
  return (
    // Spans the canvas's height so a tall legend scrolls instead of running off the top.
    <div class="pointer-events-none absolute bottom-3 right-3 top-3 z-10 flex flex-col items-end justify-end">
      <Show
        when={!collapsed()}
        fallback={
          <IconButton label="Show legend and keys" size="sm" class="pointer-events-auto border border-[var(--plc-border)] bg-[var(--plc-surface)]" onClick={toggle}>
            <Info size={14} aria-hidden="true" />
          </IconButton>
        }
      >
        <div class="pointer-events-auto min-h-0 max-w-[19rem] overflow-y-auto rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)] py-1.5 pl-2.5 pr-1 text-[11px] text-[var(--plc-on-muted)]" role="group" aria-label="Data flow legend">
          <div class="flex items-center justify-between gap-3 pb-0.5">
            <span class="font-semibold text-[var(--plc-on-surface)]">Legend and keys</span>
            <IconButton label="Hide legend" size="xs" onClick={toggle}>
              <ChevronDown size={13} aria-hidden="true" />
            </IconButton>
          </div>
          <For each={props.mode === "anchor" ? ANCHOR_GROUPS : GROUPS}>
            {(group, gi) => (
              <section classList={{ "mt-1.5": gi() > 0 }}>
                <h4 class="pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">{group.title}</h4>
                <ul class="space-y-0.5 pr-1.5">
                  <For each={group.items}>
                    {(item) => (
                      <li class="flex items-center gap-2">
                        <span class="shrink-0">{item.swatch()}</span>
                        <span class="leading-tight">{item.label}</span>
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
