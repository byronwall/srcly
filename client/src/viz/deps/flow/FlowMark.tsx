import { Show } from "solid-js";
import { FLOW_MARKS, REPETITION_BADGE, type FlowMark } from "./marks";

/**
 * The 12px mark of a flow node kind, drawn in the kind's color where the
 * import graph draws its kind glyph: a filled-center circle for the route,
 * a circle for an origin, a square for a component, a diamond for a control
 * boundary, a filled square for a terminal and a dashed diamond for a frontier.
 */
export function FlowMarkGlyph(props: { mark: FlowMark; x: number; y: number }) {
  const color = () => FLOW_MARKS[props.mark].color;
  return (
    <g transform={`translate(${props.x},${props.y})`} aria-hidden="true" style={{ color: color() }}>
      <Show when={props.mark === "route"}>
        <circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" stroke-width="1.3" />
        <circle cx="6" cy="6" r="2" fill="currentColor" />
      </Show>
      <Show when={props.mark === "origin"}>
        <circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" stroke-width="1.3" />
      </Show>
      <Show when={props.mark === "component"}>
        <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
      </Show>
      <Show when={props.mark === "control"}>
        <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      </Show>
      <Show when={props.mark === "terminal"}>
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
      </Show>
      <Show when={props.mark === "frontier"}>
        <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5" stroke-linejoin="round" />
      </Show>
    </g>
  );
}

/** A box's top-right badge for how often it renders: `?` conditional, `∗` per item. */
export function RepetitionBadge(props: { repetition: keyof typeof REPETITION_BADGE; x: number; y: number }) {
  const spec = () => REPETITION_BADGE[props.repetition];
  return (
    <g transform={`translate(${props.x},${props.y})`} aria-hidden="true">
      <circle r="6.5" fill="var(--plc-surface)" stroke="var(--plc-border-strong)" stroke-width="1" />
      <text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="var(--plc-on-muted)">
        {spec().glyph}
      </text>
    </g>
  );
}
