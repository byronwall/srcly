// A computed key reads some field of its receiver: `props.labels[key]`
// carries `props.labels` on, as a partial read rather than a stop. The key
// only picks which field; it is not the value read, so `props.key` ends at
// the index and never reaches the slot.
export function Labelled(props: { labels: Record<string, string>; key: string }) {
  const key = props.key; // @trace key forward props.key
  const label = props.labels[key]; // @trace labels forward props.labels @outcome labels ok @visits labels index-read partial @reaches key
  return <span>{label}</span>; // @reaches labels render-terminal
}
