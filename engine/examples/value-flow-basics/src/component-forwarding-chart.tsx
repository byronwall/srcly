// The module `component-forwarding.tsx` loads with `lazy(() => import(…))`.
export default function Chart(props: { series: number[] }) {
  return <ol>{props.series.length}</ol>; // @reaches fwd-lazy render-terminal
}
