export function Count(props: { count: number | null; maybe: number | undefined }) {
  return <p title={String(props.maybe!)}>{props.count ?? 0}</p>;
}
