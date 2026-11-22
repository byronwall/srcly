// A prop reaches the component that reads it through the components that
// hand it on. A spread of a view of the props (`{...rest}` after
// `splitProps`, a destructured `...rest`, or `props` itself) hands on each
// field the view holds, unless a later attribute sets it: into the child's
// own read of that prop, or into an element's attributes. A tag renders
// what the checker proves its value is: the default export of the module
// `lazy(() => import(m))` loads, the function an in-project factory
// returns, what every call of the factory passes for a component
// parameter, and each component a literal key picks from an object.
import { createSignal, For, lazy, mergeProps, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

function Leaf(props: { label: string; tone?: string }) {
  const merged = mergeProps({ tone: "plain" }, props);
  return <span class={merged.tone}>{merged.label}</span>; // @reaches fwd-drill render-terminal @never-reaches fwd-split-off,fwd-overridden
}
function Middle(props: { label: string; id: string }) {
  const [local, rest] = splitProps(props, ["id"]);
  return <div id={local.id}><Leaf {...rest} /></div>; // @reaches fwd-split-off dom-terminal
}
export function Top(props: { label: string; id: string }) {
  return <Middle id={props.id} label={props.label} />; // @trace fwd-drill forward props.label @outcome fwd-drill ok @reaches fwd-drill component-occurrence @path fwd-drill "label={props.label}" "{...rest}"
}
export function SplitOff(props: { id: string }) {
  return <Middle id={props.id} label="x" />; // @trace fwd-split-off forward props.id @outcome fwd-split-off ok @reaches fwd-split-off component-occurrence
}

// A later attribute sets the prop: the spread's copy never reaches the child.
function Fixed(props: { label: string }) {
  return <Leaf {...props} label="fixed" />;
}
export function Overridden(props: { label: string }) {
  return <Fixed label={props.label} />; // @trace fwd-overridden forward props.label @outcome fwd-overridden ok @reaches fwd-overridden component-occurrence
}

// A destructured `...rest` spread onto an element: each prop it holds is an attribute.
function Field({ label, ...rest }: JSX.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label>{label}<input {...rest} /></label>; // @reaches fwd-hint dom-terminal
}
export function EmailField(props: { hint: string }) {
  return <Field label="Email" placeholder={props.hint} />; // @trace fwd-hint forward props.hint @outcome fwd-hint ok @reaches fwd-hint component-occurrence
}

// `lazy(() => import(m))` renders the module's default export.
// eslint-disable-next-line no-restricted-syntax -- the fixture needs the loader's dynamic import
const Chart = lazy(() => import("./component-forwarding-chart"));
export function Dashboard(props: { series: number[] }) {
  return <Chart series={props.series} />; // @trace fwd-lazy forward props.series @outcome fwd-lazy ok @reaches fwd-lazy component-occurrence
}

// A factory's returned function is the component, and its component parameter is what each call passes.
function withLoud<P extends { title: string }>(Inner: (props: P) => JSX.Element) {
  return function Loud(props: P) {
    return <Inner {...props} title={props.title.toUpperCase()} />; // @reaches fwd-hoc component-occurrence
  };
}
function Heading(props: { title: string }) {
  return <h1>{props.title}</h1>; // @reaches fwd-hoc render-terminal
}
const LoudHeading = withLoud(Heading);
export function HocHost(props: { title: string }) {
  return <LoudHeading title={props.title} />; // @trace fwd-hoc forward props.title @outcome fwd-hoc ok @reaches fwd-hoc component-occurrence @path fwd-hoc "props.title" "props.title.toUpperCase()"
}

// A literal key picks each component it may name.
const Info = (props: { text: string }) => <i>{props.text}</i>; // @reaches fwd-picked render-terminal
const Warn = (props: { text: string }) => <b>{props.text}</b>; // @reaches fwd-picked render-terminal
const kinds = { info: Info, warn: Warn };
export function Notice(props: { kind: "info" | "warn"; text: string }) {
  return <Dynamic component={kinds[props.kind]} text={props.text} />; // @trace fwd-picked forward props.text @outcome fwd-picked ok @reaches fwd-picked component-occurrence
}

// A callback prop handed on (`onRemove={props.onRemove}`) runs what the outer caller hands in: here a signal setter.
function Row(props: { id: string; onRemove: (id: string) => void }) {
  return <li onClick={() => props.onRemove(props.id)}>x</li>;
}
function Rows(props: { ids: string[]; onRemove: (id: string) => void }) {
  return <For each={props.ids}>{(id) => <Row id={id} onRemove={props.onRemove} />}</For>; // @reaches fwd-handed-on component-occurrence
}
export function RowHost(props: { ids: string[] }) {
  const [removed, setRemoved] = createSignal("");
  return <div><Rows ids={props.ids} onRemove={setRemoved} />{removed()}</div>; // @trace fwd-handed-on forward props.ids @outcome fwd-handed-on ok @reaches fwd-handed-on component-occurrence @reaches fwd-handed-on render-terminal
}
