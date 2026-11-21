// The lazy-loaded module of `scenarios.tsx` (R53).
export default function Chart(props: { points: number[] }) {
  return <ol>{props.points.map((point) => <li key={point}>{point}</li>)}</ol>;
}
