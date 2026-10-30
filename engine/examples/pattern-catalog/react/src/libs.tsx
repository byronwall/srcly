import { useQuery, useMutation } from "@tanstack/react-query";
import { create } from "zustand";
import { memo, forwardRef } from "react";

// R19 react-query data to render
export function Todos() {
  const { data } = useQuery({ queryKey: ["todos"], queryFn: () => fetch("/api/todos").then((r) => r.json() as Promise<string[]>) });
  return <ul>{data?.map((t) => <li key={t}>{t}</li>)}</ul>; // @trace r-query backward data?.map((t) => <li key={t}>{t}</li>) @want fetch-input
}

// R20 mutation with a variable
export function AddTodo() {
  const add = useMutation({ mutationFn: (text: string) => fetch("/api/todos", { method: "POST", body: text }) });
  return <button onClick={() => add.mutate("new")}>add</button>;
}
export function AddTodoText(props: { text: string }) { // @trace r-mutation forward props.text @want external-effect
  const add = useMutation({ mutationFn: (text: string) => fetch("/api/todos", { method: "POST", body: text }) });
  return <button onClick={() => add.mutate(props.text)}>add</button>;
}

// R21 zustand store
const useStore = create<{ count: number; setCount: (n: number) => void }>((set) => ({ count: 0, setCount: (n) => set({ count: n }) }));
export function StoreView(props: { n: number }) { // @trace r-zustand forward props.n @want render-terminal
  const count = useStore((s) => s.count);
  const setCount = useStore((s) => s.setCount);
  return <button onClick={() => setCount(props.n)}>{count}</button>;
}

// R22 memo / forwardRef wrapped components
const Badge = memo(function Badge(props: { text: string }) {
  return <span>{props.text}</span>;
});
const Field = forwardRef<HTMLInputElement, { hint: string }>(function Field(props, ref) {
  return <input ref={ref} placeholder={props.hint} />;
});
export function Wrapped(props: { text: string; hint: string }) { // @trace r-memo-wrapped forward props.text @want render-terminal
  return <div><Badge text={props.text} /><Field hint={props.hint} /></div>; // @trace r-forward-ref forward props.hint @want dom-terminal
}
