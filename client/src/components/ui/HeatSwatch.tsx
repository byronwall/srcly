/**
 * A legend-style key in the treemap's heat color. Lists use it beside a
 * neutral number, so color links a row to the treemap without the row
 * reading as another treemap tile. The ring keeps pale ramp stops visible.
 */
export function HeatSwatch(props: { color: string; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={`inline-block h-2 w-2 shrink-0 rounded-[2px] ring-1 ring-inset ring-black/10 ${props.class ?? ""}`}
      style={{ background: props.color }}
    />
  );
}
