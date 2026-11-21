import { children, createSignal, ErrorBoundary, For, lazy, Match, mergeProps, Show, splitProps, Suspense, Switch, type Accessor, type JSX, type ParentProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";

// S59 children() helper
function Stack(props: ParentProps) {
  const resolved = children(() => props.children);
  return <div>{resolved()}</div>;
}
export function Stacked(props: { text: string }) { // @trace s-children-helper forward props.text @want render-terminal
  return <Stack><span>{props.text}</span></Stack>;
}

// S60 render-prop children
function Mouse(props: { children: (x: number) => JSX.Element }) {
  const [x, setX] = createSignal(0);
  return <div onMouseMove={(e) => setX(e.clientX)}>{props.children(x())}</div>; // @trace s-render-prop forward e.clientX @want render-terminal
}
export function Tracker() {
  return <Mouse>{(x) => <b>{x}</b>}</Mouse>;
}

// S61 Dynamic with a component map and a prop
const Info = (props: { text: string }) => <i>{props.text}</i>;
const Warn = (props: { text: string }) => <b>{props.text}</b>;
const kinds = { info: Info, warn: Warn };
export function Notice(props: { kind: "info" | "warn"; text: string }) { // @trace s-dynamic-component forward props.text @want render-terminal
  return <Dynamic component={kinds[props.kind]} text={props.text} />;
}

// S62 Portal
export function Modal(props: { title: string }) { // @trace s-portal forward props.title @want render-terminal
  return <Portal><h2>{props.title}</h2></Portal>;
}

// S63 Switch / Match keyed callback
export function Result(props: { error?: { message: string }; data?: string }) { // @trace s-match-callback forward props.error @want render-terminal
  return (
    <Switch>
      <Match when={props.error}>{(error) => <p>{error().message}</p>}</Match>
      <Match when={props.data}><p>{props.data}</p></Match>
    </Switch>
  );
}

// S64 Suspense fallback
export function Wait(props: { hint: string }) { // @trace s-suspense-fallback forward props.hint @want render-terminal
  return <Suspense fallback={<p>{props.hint}</p>}><span>x</span></Suspense>;
}

// S65 ErrorBoundary fallback (err, reset)
function Boom(props: { message: string }): JSX.Element {
  throw new Error(props.message);
}
export function Guard(props: { message: string }) {
  return <ErrorBoundary fallback={(err: Error, reset) => <p onClick={reset}>{err.message}</p>}><Boom message={props.message} /></ErrorBoundary>; // @trace s-error-fallback backward err.message @want parameter
}

// S66 Show fallback
export function Maybe(props: { name?: string; placeholder: string }) { // @trace s-show-fallback forward props.placeholder @want render-terminal
  return <Show when={props.name} fallback={<i>{props.placeholder}</i>}><b>{props.name}</b></Show>;
}

// S67 prop drilling through three levels with splitProps / mergeProps
function Leaf(props: { label: string; tone?: string }) {
  const merged = mergeProps({ tone: "plain" }, props);
  return <span class={merged.tone}>{merged.label}</span>;
}
function Middle(props: { label: string; tone?: string; id: string }) {
  const [local, rest] = splitProps(props, ["id"]);
  return <div id={local.id}><Leaf {...rest} /></div>;
}
export function Top(props: { label: string }) { // @trace s-prop-drill forward props.label @want render-terminal
  return <Middle id="m" label={props.label} />;
}

// S68 the id split off at the middle level reaches its attribute only
export function Tagged(props: { id: string }) { // @trace s-split-local forward props.id @want dom-terminal
  return <Middle id={props.id} label="x" />;
}

// S69 accessor passed down two levels
function Inner(props: { value: Accessor<string> }) {
  return <em>{props.value()}</em>;
}
function Outer(props: { value: Accessor<string> }) {
  return <Inner value={props.value} />;
}
export function AccessorHost() {
  const [text, setText] = createSignal("");
  return <div><input onInput={(e) => setText(e.currentTarget.value)} /><Outer value={text} /></div>; // @trace s-accessor-drill forward e.currentTarget.value @want render-terminal
}

// S70 getter prop (reactive expression at the call site)
function Price(props: { amount: number }) {
  return <b>{props.amount.toFixed(2)}</b>; // @trace s-getter-prop backward props.amount @want literal
}
export function Checkout() {
  const [count] = createSignal(2);
  return <Price amount={count() * 5} />;
}

// S71 lazy component receives a prop
const Chart = lazy(() => import("./lazy-chart"));
export function Dashboard(props: { series: number[] }) { // @trace s-lazy forward props.series @want render-terminal
  return <Suspense><Chart series={props.series} /></Suspense>;
}

// S72 spread props onto an element
function Field(props: JSX.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [local, rest] = splitProps(props, ["label"]);
  return <label>{local.label}<input {...rest} /></label>;
}
export function EmailField(props: { hint: string }) { // @trace s-spread-rest forward props.hint @want dom-terminal
  return <Field label="Email" placeholder={props.hint} />;
}

// S73 callback prop with data up two levels
function Row(props: { id: string; onRemove: (id: string) => void }) {
  return <li onClick={() => props.onRemove(props.id)}>x</li>;
}
function Rows(props: { ids: string[]; onRemove: (id: string) => void }) {
  return <For each={props.ids}>{(id) => <Row id={id} onRemove={props.onRemove} />}</For>;
}
export function RowHost(props: { ids: string[] }) { // @trace s-callback-up forward props.ids @want render-terminal
  const [removed, setRemoved] = createSignal("");
  return <div><Rows ids={props.ids} onRemove={setRemoved} />{removed()}</div>;
}
