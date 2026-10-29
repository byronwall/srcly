import { Show } from "solid-js";
import { markVar, REPETITION_BADGE, type FlowMark } from "./marks";

/**
 * The 12px mark of a flow node kind, drawn in the kind's color where the
 * import graph draws its kind glyph: a filled-center circle for the route,
 * a circle for an origin, a square for a component, a diamond for a control
 * boundary, a filled square for a terminal and a dashed diamond for a frontier.
 */
export function FlowMarkGlyph(props: { mark: FlowMark; x: number; y: number }) {
  return (
    <g transform={`translate(${props.x},${props.y})`} aria-hidden="true" style={{ color: markVar(props.mark) }}>
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
      <Show when={props.mark === "anchor"}>
        <circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" stroke-width="1.3" />
        <path d="M6 0 V3 M6 9 V12 M0 6 H3 M9 6 H12" stroke="currentColor" stroke-width="1.3" />
        <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      </Show>
      <Show when={props.mark === "frame"}>
        <path d="M4 1.2 C2.2 1.2 2.6 5.2 1 6 C2.6 6.8 2.2 10.8 4 10.8 M8 1.2 C9.8 1.2 9.4 5.2 11 6 C9.4 6.8 9.8 10.8 8 10.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </Show>
      <Show when={props.mark === "server"}>
        <rect x="1.5" y="1.5" width="9" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" />
        <rect x="1.5" y="6.5" width="9" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" />
        <circle cx="3.6" cy="3.5" r="0.8" fill="currentColor" />
        <circle cx="3.6" cy="8.5" r="0.8" fill="currentColor" />
      </Show>
      <Show when={props.mark === "state"}>
        <ellipse cx="6" cy="2.8" rx="4.5" ry="1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
        <path d="M1.5 2.8 V9.2 C1.5 11.6 10.5 11.6 10.5 9.2 V2.8" fill="none" stroke="currentColor" stroke-width="1.3" />
      </Show>
      <Show when={props.mark === "value"}>
        <circle cx="6" cy="6" r="3" fill="currentColor" />
      </Show>
      <Show when={props.mark === "transform"}>
        <path d="M1.5 1.2 L11 6 L1.5 10.8 z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      </Show>
      <Show when={props.mark === "boundary"}>
        <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5" />
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
