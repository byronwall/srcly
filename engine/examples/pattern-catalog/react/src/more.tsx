import { Component, createContext, useContext, useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

// R23 window listener in an effect into state
export function Width() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth); // @trace r-effect-listener forward window.innerWidth @want render-terminal
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return <i>{width}</i>;
}

// R24 ref as a mutable counter
export function Clicks(props: { step: number }) { // @trace r-ref-counter forward props.step @want return|render-terminal|write
  const count = useRef(0);
  const click = () => {
    count.current += props.step;
    return count.current;
  };
  return <button onClick={click}>+</button>;
}

// R25 context with a reducer's dispatch
type Act = { type: "rename"; name: string };
const Dispatch = createContext<(action: Act) => void>(() => {});
function nameReducer(state: string, action: Act) {
  return action.type === "rename" ? action.name : state;
}
function Renamer(props: { next: string }) { // @trace r-context-dispatch forward props.next @want render-terminal
  const dispatch = useContext(Dispatch);
  return <button onClick={() => dispatch({ type: "rename", name: props.next })}>rename</button>;
}
export function NameRoot() {
  const [name, dispatch] = useReducer(nameReducer, "");
  return <Dispatch.Provider value={dispatch}><Renamer next="b" /><b>{name}</b></Dispatch.Provider>;
}

// R26 custom hook returning a tuple
function useCounter(start: number) {
  const [n, setN] = useState(start);
  return [n, () => setN((v) => v + 1)] as const;
}
export function TupleHook(props: { start: number }) { // @trace r-tuple-hook forward props.start @want render-terminal
  const [n, inc] = useCounter(props.start);
  return <button onClick={inc}>{n}</button>;
}

// R27 controlled select
export function Picker() {
  const [kind, setKind] = useState("a");
  return <select value={kind} onChange={(e) => setKind(e.target.value)}><option>a</option></select>; // @trace r-select forward e.target.value @want dom-terminal
}

// R28 form submit with FormData to fetch
export function Signup() {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email"); // @trace r-form-submit forward new FormData(event.currentTarget).get("email") @want external-effect
    await fetch("/api/signup", { method: "POST", body: JSON.stringify({ email }) });
  };
  return <form onSubmit={submit}><input name="email" /></form>;
}

// R29 render prop
function Mouse(props: { render: (x: number) => ReactNode; x: number }) {
  return <div>{props.render(props.x)}</div>;
}
export function MouseHost(props: { x: number }) { // @trace r-render-prop forward props.x @want render-terminal
  return <Mouse x={props.x} render={(x) => <span>{x}</span>} />;
}

// R30 class component state
export class Toggle extends Component<{ label: string }, { on: boolean }> {
  state = { on: false };
  render() {
    return <button onClick={() => this.setState({ on: !this.state.on })}>{this.props.label}</button>; // @trace r-class-props forward this.props.label @want render-terminal
  }
}

// R31 react-hook-form register and submit
export function HookForm(props: { save: (name: string) => void }) {
  const { register, handleSubmit } = useForm<{ name: string }>();
  return <form onSubmit={handleSubmit((values) => props.save(values.name))}><input {...register("name")} /></form>; // @trace r-hook-form backward values.name @want parameter
}

// R32 next router push
export function GoTo(props: { slug: string }) { // @trace r-router-push forward props.slug @want external-effect
  const router = useRouter();
  return <button onClick={() => router.push(`/p/${props.slug}`)}>go</button>;
}

// R33 derived state during render with a filter
export function Search(props: { items: string[] }) {
  const [query, setQuery] = useState("");
  const shown = props.items.filter((item) => item.includes(query));
  return <div><input onChange={(e) => setQuery(e.target.value)} />{shown.map((s) => <p key={s}>{s}</p>)}</div>; // @trace r-filter-derived forward e.target.value @want render-terminal
}

// R34 localStorage-backed state
export function Remembered() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "light"); // @trace r-storage-init forward localStorage.getItem("theme") @want dom-terminal|render-terminal
  useEffect(() => localStorage.setItem("theme", theme), [theme]);
  return <div className={theme} onClick={() => setTheme("dark")}>t</div>;
}
