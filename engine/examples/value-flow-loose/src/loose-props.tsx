// With `strictNullChecks` off `other` reads as `string`, though it may be
// undefined, so `mergeProps` cannot drop the caller's `kind` for it. A literal
// is still sure to be there.
import { mergeProps } from "solid-js";

function Maybe(props: { kind: string; other?: string }) {
  const merged = mergeProps(props, { kind: props.other });
  return <b>{merged.kind}</b>; // @reaches loose-kept render-terminal
}

export function MaybeHost(props: { kind: string }) {
  return <Maybe kind={props.kind} />; // @trace loose-kept forward props.kind @outcome loose-kept ok @reaches loose-kept component-occurrence
}

function Fixed(props: { kind: string }) {
  const merged = mergeProps(props, { kind: "fixed" });
  return <b>{merged.kind}</b>; // @never-reaches loose-fixed
}

export function FixedHost(props: { kind: string }) {
  return <Fixed kind={props.kind} />; // @trace loose-fixed forward props.kind @outcome loose-fixed ok @reaches loose-fixed component-occurrence
}
