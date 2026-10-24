function shout(value: string) {
  return value.toUpperCase();
}

export function Two(props: { a: string; b: string }) {
  return (
    <div>
      <span>{shout(props.a)}</span>
      <span>{shout(props.b)}</span>
    </div>
  );
}
