// A component with helpers nested inside it. The helpers' parameters and
// returns are theirs, not the component's: anchored by name, `Rail` takes
// only `props` and returns only its JSX. The parent renders it, which is
// where its value ends.
export function Rail(props: { size: number; label: string }) {
  function widthOf(depth: number) {
    if (depth <= 0) return 14;
    return 5;
  }
  const tall = () => props.size > 3;
  return (
    <div style={{ width: `${widthOf(props.size)}px` }} title={tall() ? "tall" : "short"}>
      {props.label}
    </div>
  );
}

export function RailHost() {
  return <Rail size={2} label="toc" />;
}
