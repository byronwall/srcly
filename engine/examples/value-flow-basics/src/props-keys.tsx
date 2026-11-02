// A view of a component's props holds fields, not everything: each half of
// `splitProps` holds its own keys, and `mergeProps` takes each field from the
// last source that sets it. A prop a view does not hold never reaches a read of
// that view. A list of keys the code computes, or a later source that may be
// undefined, proves nothing, so the prop stays.
import { mergeProps, splitProps } from "solid-js";

function Split(props: { label: string; kind: string; size: string }) {
  const [local, sized, rest] = splitProps(props, ["label"], ["size"]);
  return (
    // @never-reaches keys-label,keys-kind,keys-size
    <button class={rest.label} title={local.kind} name={rest.size} value={sized.kind}>
      {local.label} {/* @reaches keys-label render-terminal */}
      {sized.size} {/* @reaches keys-size render-terminal */}
      {rest.kind} {/* @reaches keys-kind render-terminal */}
    </button>
  );
}

export function SplitHost(props: { label: string; kind: string; size: string }) {
  return (
    // @trace keys-label forward props.label @outcome keys-label ok @no-path keys-label "props.label" "rest.label"
    <Split label={props.label} kind={props.kind} size={props.size} /> // @trace keys-kind forward props.kind @trace keys-size forward props.size @reaches keys-label,keys-kind,keys-size component-occurrence
  );
}

const KEYS = ["label"] as const;

function Computed(props: { label: string }) {
  const [local, rest] = splitProps(props, KEYS);
  return <i title={rest.label}>{local.label}</i>; // @reaches computed render-terminal @reaches computed dom-terminal
}

export function ComputedHost(props: { label: string }) {
  return <Computed label={props.label} />; // @trace computed forward props.label @reaches computed component-occurrence
}

function Fixed(props: { kind: string }) {
  const merged = mergeProps(props, { kind: "fixed" });
  return <b>{merged.kind}</b>; // @never-reaches fixed-kind
}

export function FixedHost(props: { kind: string }) {
  return <Fixed kind={props.kind} />; // @trace fixed-kind forward props.kind @outcome fixed-kind ok @reaches fixed-kind component-occurrence
}

function Defaulted(props: { kind?: string; other: string; fallback: string }) {
  const merged = mergeProps({ kind: props.fallback }, props); // @trace default-field forward props.fallback
  return (
    // @never-reaches default-field dom-terminal
    <b title={merged.other}>
      {merged.kind} {/* @reaches default-field,default-kind render-terminal */}
    </b>
  );
}

export function DefaultedHost(props: { kind: string; other: string; fallback: string }) {
  return <Defaulted kind={props.kind} other={props.other} fallback={props.fallback} />; // @trace default-kind forward props.kind @reaches default-kind component-occurrence
}

function Maybe(props: { kind: string; other?: string }) {
  const merged = mergeProps(props, { kind: props.other });
  return <b>{merged.kind}</b>; // @reaches maybe-kind render-terminal
}

export function MaybeHost(props: { kind: string }) {
  return <Maybe kind={props.kind} />; // @trace maybe-kind forward props.kind @reaches maybe-kind component-occurrence
}

function Literal(props: { other: string; note?: number }) {
  const merged = mergeProps({ note: 1 }, props); // @never-reaches literal-other object-pack
  return <b>{merged.other}</b>; // @trace literal-other backward merged.other @outcome literal-other ok
}

export function LiteralHost() {
  return <Literal other="given" />;
}
