import { For } from "solid-js";

export default function Chart(props: { series: number[] }) {
  return <For each={props.series}>{(point) => <i>{point}</i>}</For>;
}
