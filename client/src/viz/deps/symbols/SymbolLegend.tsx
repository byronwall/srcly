import { ChevronDown, Info } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { IconButton } from "../../../components/ui/IconButton";
import { CONTEXT_EDGE_DASH, CONTEXT_EDGE_OPACITY, DOTTED_BOX_DASH, EDGE_OPACITY, HANDOFF_EDGE_DASH, STRUCTURAL_EDGE_DASH } from "../encoding";
import { KindGlyph } from "../DependencyCanvas";

const COLLAPSED_KEY = "srcly.symbolLegendCollapsed";
const SW = 30;
const SH = 14;

function readCollapsed(): boolean {
  try {
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

function EdgeSwatch(props: { dash?: string; accent?: boolean; muted?: boolean; partial?: boolean; faint?: boolean; width?: number }) {
  const ink = () => (props.accent ? "var(--plc-accent)" : props.partial ? "var(--plc-warning)" : props.muted ? "var(--plc-on-disabled)" : "var(--plc-tertiary)");
  const opacity = () => (props.faint ? CONTEXT_EDGE_OPACITY : EDGE_OPACITY);
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <line x1="1" y1={SH / 2} x2={SW - 6} y2={SH / 2} stroke={ink()} stroke-width={props.width ?? 1.4} stroke-opacity={opacity()} stroke-dasharray={props.dash} />
      <path d={`M${SW - 7},${SH / 2 - 3.2} L${SW - 0.5},${SH / 2} L${SW - 7},${SH / 2 + 3.2} z`} fill={ink()} fill-opacity={opacity()} />
    </svg>
  );
}

function BoxSwatch(props: { dash?: string; frame?: boolean; glyph?: string }) {
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true">
      <rect x="1.5" y="1.5" width={SW - 3} height={SH - 3} rx="2.5" fill={props.frame ? "none" : "var(--plc-surface)"} stroke={props.frame ? "var(--plc-border)" : "var(--plc-border-strong)"} stroke-dasharray={props.dash} />
      <Show when={props.glyph}>
        <KindGlyph node={{ kind: "symbol", symbolKind: props.glyph }} x={SW / 2 - 6} y={1} />
      </Show>
    </svg>
  );
}

function KeySwatch(props: { keys: string }) {
  return <kbd class="inline-block min-w-[30px] rounded border border-[var(--plc-border-strong)] px-1 text-center font-mono text-[10px] leading-[14px] text-[var(--plc-on-surface)]">{props.keys}</kbd>;
}

const ROWS: { swatch: () => JSX.Element; label: string; hint: string }[] = [
  { swatch: () => <EdgeSwatch width={1.8} />, label: "calls", hint: "a call; thicker with more call sites" },
  { swatch: () => <EdgeSwatch />, label: "new", hint: "a class instantiated" },
  { swatch: () => <EdgeSwatch dash={CONTEXT_EDGE_DASH} faint />, label: "reads", hint: "a value read, or a function passed along" },
  { swatch: () => <EdgeSwatch accent />, label: "writes", hint: "an assignment to a variable or field" },
  { swatch: () => <EdgeSwatch dash={STRUCTURAL_EDGE_DASH} muted />, label: "type", hint: "a type named in an annotation" },
  { swatch: () => <EdgeSwatch dash={HANDOFF_EDGE_DASH} />, label: "extends · implements", hint: "a class or interface extended or implemented" },
  { swatch: () => <EdgeSwatch partial faint />, label: "a guess", hint: "resolved by member name alone: the one member of the index with that name" },
  { swatch: () => <BoxSwatch glyph="method" />, label: "box", hint: "a function, class, method, field, variable, type or module; the note counts its references in the whole index" },
  { swatch: () => <BoxSwatch frame />, label: "frame", hint: "the focus with its members; a file on either side, its classes grouped inside" },
  { swatch: () => <BoxSwatch dash={DOTTED_BOX_DASH} />, label: "test", hint: "a symbol in a test file" },
  { swatch: () => <KeySwatch keys="⇧click" />, label: "open a hop", hint: "a box with more references than drawn opens its own hop in place (E)" },
  { swatch: () => <KeySwatch keys="F" />, label: "focus", hint: "centre the graph on the hovered or selected box; / finds any symbol" },
];

/** Symbols mode's legend: edge kinds, sureness, boxes and gestures. Collapsed until opened once. */
export function SymbolLegend() {
  const [collapsed, setCollapsed] = createSignal(readCollapsed());
  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    writeCollapsed(next);
  };
  return (
    <div class="absolute bottom-2 left-2 z-10 max-w-[22rem] rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)]/95 text-[11px] text-[var(--plc-on-muted)] shadow-sm backdrop-blur" data-symbol-legend>
      <Show when={collapsed()} fallback={
        <>
          <div class="flex items-center justify-between gap-2 border-b border-[var(--plc-divider)] px-2 py-1">
            <span class="font-semibold text-[var(--plc-on-surface)]">Symbols</span>
            <IconButton label="Collapse the legend" size="xs" onClick={toggle}>
              <ChevronDown size={12} aria-hidden="true" />
            </IconButton>
          </div>
          <div class="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-2 py-1.5">
            <For each={ROWS}>
              {(row) => (
                <>
                  <span class="flex items-center">{row.swatch()}</span>
                  <span class="whitespace-nowrap font-medium text-[var(--plc-on-surface)]">{row.label}</span>
                  <span class="leading-tight">{row.hint}</span>
                </>
              )}
            </For>
          </div>
        </>
      }>
        <IconButton label="Show the legend" title="Legend" size="sm" onClick={toggle}>
          <Info size={13} aria-hidden="true" />
        </IconButton>
      </Show>
    </div>
  );
}
