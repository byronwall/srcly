export function Pair(props: { left: { name: string }; right: { name: string } }) {
  return (
    <div>
      <span>{props.left.name}</span>
      <em>{props.right.name}</em>
    </div>
  );
}
