import { forwardRef, memo, useState } from "react";

type ButtonProps = { label: string; onPress: () => void };

export function Button({ label, onPress }: ButtonProps) {
  return <button onClick={onPress}>{label}</button>;
}

export const Toggle = memo(function Toggle(props: { on: boolean; label: string }) {
  const [on, setOn] = useState(props.on);
  return (
    <label>
      <input type="checkbox" checked={on} onChange={() => setOn(!on)} />
      {props.label}
    </label>
  );
});

export const Field = forwardRef<HTMLInputElement, { name: string }>((props, ref) => {
  return <input ref={ref} name={props.name} />;
});

// Not a component: lowercase, and returns no JSX.
export function formatLabel(label: string) {
  return label.trim();
}

export function Heading(props) {
  return <h2 title={props.title}>{props.text}</h2>;
}
